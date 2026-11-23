import assert from 'node:assert/strict';
import test from 'node:test';
import { H3, HTTPError } from 'nitro/h3';
import { applyCardCors } from '../server/utils/card-cors.ts';

async function environment(value, run) {
  const saved = process.env.CARD_ALLOWED_ORIGINS;
  if (value === undefined) delete process.env.CARD_ALLOWED_ORIGINS;
  else process.env.CARD_ALLOWED_ORIGINS = value;
  try { await run(); }
  finally {
    if (saved === undefined) delete process.env.CARD_ALLOWED_ORIGINS;
    else process.env.CARD_ALLOWED_ORIGINS = saved;
  }
}

function endpoint({ fail = false } = {}) {
  let reads = 0;
  const app = new H3();
  app.on('', '/api/card', event => {
    const preflight = applyCardCors(event);
    if (preflight) return preflight;
    reads++;
    if (fail) throw new HTTPError('Profile not found', { status: 404 });
    return { name: 'Doctor' };
  });
  return {
    request: (headers = {}, method = 'GET') => app.fetch(new Request('https://cards.example/api/card', { method, headers })),
    reads: () => reads,
  };
}

function vary(response, expected) {
  assert.deepEqual(new Set(response.headers.get('vary').split(',').map(value => value.trim().toLowerCase())), new Set(expected));
}

function permitted(response, origin) {
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

test('default policy permits no-origin and same-origin reads, rejecting other origins before data work', async () => environment(undefined, async () => {
  const api = endpoint();
  const plain = await api.request();
  assert.equal(plain.status, 200);
  permitted(plain, null);
  vary(plain, ['origin']);
  const same = await api.request({ Origin: 'https://cards.example' }, 'POST');
  assert.equal(same.status, 200);
  permitted(same, 'https://cards.example');
  for (const origin of ['https://other.example', 'null', '*', 'https://cards.example.evil', 'http://cards.example', 'https://cards.example:444']) {
    const denied = await api.request({ Origin: origin });
    assert.equal(denied.status, 403, origin);
    permitted(denied, null);
    vary(denied, ['origin']);
  }
  assert.equal(api.reads(), 2);
}));

test('allowlist matches exact canonical origins and is read anew for each request', async () => environment(' https://site.example, http://localhost:5173 ,https://[::1]:8443 ', async () => {
  const api = endpoint();
  for (const origin of ['https://site.example', 'http://localhost:5173', 'https://[::1]:8443']) {
    const response = await api.request({ Origin: origin });
    assert.equal(response.status, 200);
    permitted(response, origin);
  }
  for (const origin of ['https://site.example.evil', 'https://evil.site.example', 'http://site.example', 'https://site.example:444', 'https://site.example@evil.example', 'https://evil.example@site.example', 'https://site.example/', 'null']) {
    assert.equal((await api.request({ Origin: origin })).status, 403, origin);
  }
  process.env.CARD_ALLOWED_ORIGINS = 'https://new.example';
  assert.equal((await api.request({ Origin: 'https://site.example' })).status, 403);
  assert.equal((await api.request({ Origin: 'https://new.example' })).status, 200);
  assert.equal(api.reads(), 4);
}));

test('malformed configured entries never grant their parsed origin or wildcard access', async () => {
  const malformed = [
    '*', 'null', 'https://*.site.example', '.site.example', 'site.example', '//site.example',
    'https://site.example/', 'https://site.example/path', 'https://site.example?x', 'https://site.example#x',
    'https://user@site.example', 'https://user:pass@site.example', 'https://evil.example@site.example',
    'https://site.example\\path', 'https://si\tte.example', 'ftp://site.example', 'https:site.example',
    'https://site.example:443', 'https://SITE.example',
  ];
  for (const configured of malformed) await environment(configured, async () => {
    const api = endpoint();
    for (const origin of ['https://site.example', 'https://evil.example', 'https://child.site.example']) {
      assert.equal((await api.request({ Origin: origin })).status, 403, configured);
    }
    assert.equal(api.reads(), 0);
  });
});

test('JSON POST and GET preflights return empty 204 responses without reading data', async () => environment('https://site.example', async () => {
  const api = endpoint();
  for (const origin of ['https://site.example', 'https://cards.example']) {
    for (const method of ['GET', 'POST']) {
      const response = await api.request({
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'Content-Type',
      }, 'OPTIONS');
      assert.equal(response.status, 204);
      assert.equal(await response.text(), '');
      permitted(response, origin);
      assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST');
      assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
      vary(response, ['origin', 'access-control-request-method', 'access-control-request-headers']);
    }
  }
  const simple = await api.request({ Origin: 'https://site.example', 'Access-Control-Request-Method': 'GET' }, 'OPTIONS');
  assert.equal(simple.status, 204);
  assert.equal(simple.headers.get('access-control-allow-headers'), null);
  assert.equal(api.reads(), 0);
}));

test('unsupported preflights deny methods and headers before data work, retaining allowed-origin error headers', async () => environment('https://site.example', async () => {
  const api = endpoint();
  const base = { Origin: 'https://site.example', 'Access-Control-Request-Method': 'POST' };
  const requests = [
    { Origin: base.Origin },
    { ...base, 'Access-Control-Request-Method': 'DELETE' },
    { ...base, 'Access-Control-Request-Method': 'post' },
    { ...base, 'Access-Control-Request-Headers': 'Authorization' },
    { ...base, 'Access-Control-Request-Headers': 'Content-Type, X-Secret' },
    { ...base, 'Access-Control-Request-Headers': 'Content-Type,' },
    { ...base, 'Access-Control-Request-Headers': '*' },
  ];
  for (const headers of requests) {
    const denied = await api.request(headers, 'OPTIONS');
    assert.equal(denied.status, 403);
    permitted(denied, base.Origin);
    assert.equal(denied.headers.get('access-control-allow-methods'), null);
    vary(denied, ['origin', 'access-control-request-method', 'access-control-request-headers']);
  }
  assert.equal((await api.request({ 'Access-Control-Request-Method': 'POST' }, 'OPTIONS')).status, 403);
  const untrusted = await api.request({ ...base, Origin: 'https://evil.example' }, 'OPTIONS');
  assert.equal(untrusted.status, 403);
  permitted(untrusted, null);
  assert.equal(api.reads(), 0);
}));

test('allowed origins can read downstream errors and unsupported actual methods get 405', async () => environment('https://site.example', async () => {
  const api = endpoint({ fail: true });
  const error = await api.request({ Origin: 'https://site.example' });
  assert.equal(error.status, 404);
  permitted(error, 'https://site.example');
  assert.match(await error.text(), /Profile not found/);
  vary(error, ['origin']);
  for (const method of ['PUT', 'DELETE', 'HEAD']) {
    const denied = await api.request({ Origin: 'https://site.example' }, method);
    assert.equal(denied.status, 405);
    permitted(denied, 'https://site.example');
    assert.equal(denied.headers.get('allow'), 'GET, POST, OPTIONS');
  }
  assert.equal(api.reads(), 1);
}));
