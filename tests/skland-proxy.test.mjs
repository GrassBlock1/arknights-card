import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { sklandFetch } from '../server/utils/skland.ts';

const names = ['CARD_SKLAND_PROXY', 'CARD_SKLAND_RELAY_URL'];

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

function json(body) {
  return async (req, res) => {
    req.resume();
    await new Promise(resolve => req.on('end', resolve));
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  };
}

async function origin() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`);
    await json({ code: 0, data: { ok: true } })(req, res);
  });
  return { url: await listen(server), requests, close: () => server.close() };
}

async function tunnelProxy() {
  const tunnels = [];
  const server = http.createServer((req, res) => res.writeHead(501).end());
  server.on('connect', (req, client, head) => {
    tunnels.push(req.url);
    const index = req.url.lastIndexOf(':');
    const upstream = net.connect(Number(req.url.slice(index + 1)), req.url.slice(0, index), () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  return { url: await listen(server), tunnels, close: () => server.close() };
}

async function relay() {
  const forwarded = [];
  const server = http.createServer(async (req, res) => {
    forwarded.push(new URL(req.url, 'http://relay').searchParams.get('url'));
    await json({ code: 0, data: { ok: true } })(req, res);
  });
  return { url: await listen(server), forwarded, close: () => server.close() };
}

function environment(values, run) {
  const saved = names.map(name => process.env[name]);
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(run)
    .finally(() => names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }));
}

test('Skland requests stay direct without a configured transport', async () => {
  const target = await origin();
  const proxy = await tunnelProxy();
  try {
    await environment({}, async () => {
      assert.deepEqual(await (await sklandFetch(`${target.url}/direct`, {})).json(), { code: 0, data: { ok: true } });
      assert.deepEqual(proxy.tunnels, []);
      assert.deepEqual(target.requests, ['GET /direct']);
    });
  } finally {
    target.close();
    proxy.close();
  }
});

test('CARD_SKLAND_PROXY routes Skland requests through the HTTP proxy', async () => {
  const target = await origin();
  const proxy = await tunnelProxy();
  try {
    await environment({ CARD_SKLAND_PROXY: proxy.url }, async () => {
      assert.equal((await sklandFetch(`${target.url}/proxied`, { method: 'POST', body: '{}' })).status, 200);
      assert.deepEqual(proxy.tunnels, [new URL(target.url).host]);
      assert.deepEqual(target.requests, ['POST /proxied']);
    });
  } finally {
    target.close();
    proxy.close();
  }
});

test('invalid proxy and relay configuration fail as misconfiguration', async () => {
  for (const value of ['ftp://127.0.0.1:21', 'not a url', '127.0.0.1:7890']) {
    await environment({ CARD_SKLAND_PROXY: value }, async () => {
      await assert.rejects(sklandFetch('https://zonai.skland.com/api/v1/game/cards', {}), error => {
        assert.equal(error.status, 503);
        assert.match(error.message, /CARD_SKLAND_PROXY 配置无效/);
        return true;
      });
    });
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true });
  try {
    for (const value of ['http://relay.example/proxy', 'not a url']) {
      await environment({ CARD_SKLAND_RELAY_URL: value }, async () => {
        await assert.rejects(sklandFetch('https://zonai.skland.com/api/v1/game/cards', {}), error => {
          assert.equal(error.status, 503);
          assert.match(error.message, /CARD_SKLAND_RELAY_URL 配置无效/);
          return true;
        });
      });
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  }
});

test('CARD_SKLAND_RELAY_URL forwards the complete Skland URL on Workers', async () => {
  const server = await relay();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true });
  try {
    await environment({ CARD_SKLAND_RELAY_URL: `${server.url}/proxy` }, async () => {
      const upstream = 'https://zonai.skland.com/api/v1/game/player/info?uid=42';
      assert.equal((await sklandFetch(upstream, { headers: { cred: 'private-test-credential' } })).status, 200);
      assert.deepEqual(server.forwarded, [upstream]);
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
    server.close();
  }
});
