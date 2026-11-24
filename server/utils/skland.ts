import { createHash, createHmac } from 'node:crypto';
import { HTTPError } from 'nitro';
import type * as Undici from 'undici';
import type { ProxyAgent } from 'undici';

const HG = 'https://as.hypergryph.com';
const SK = 'https://zonai.skland.com';
type Payload = Record<string, any>;

let nodeProxy: { url: string; dispatcher: ProxyAgent } | undefined;
// Not inlined: worker bundles must not pull in undici, which needs Node.js sockets.
const UNDICI_MODULE = 'undici';

function relayTarget(url: string): URL | undefined {
  const relay = process.env.CARD_SKLAND_RELAY_URL?.trim();
  if (!relay) return undefined;
  let target: URL;
  try { target = new URL(relay); } catch { throw new HTTPError('CARD_SKLAND_RELAY_URL 配置无效', { status: 503 }); }
  const loopback = target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '[::1]';
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && loopback)) throw new HTTPError('CARD_SKLAND_RELAY_URL 配置无效', { status: 503 });
  target.searchParams.set('url', url);
  return target;
}

function proxyEndpoint(): string | undefined {
  const proxy = process.env.CARD_SKLAND_PROXY?.trim();
  if (!proxy) return undefined;
  let url: URL;
  try { url = new URL(proxy); } catch { throw new HTTPError('CARD_SKLAND_PROXY 配置无效', { status: 503 }); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HTTPError('CARD_SKLAND_PROXY 配置无效', { status: 503 });
  return url.href;
}

export async function sklandFetch(url: string, options: RequestInit): Promise<Response> {
  if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') {
    const target = relayTarget(url);
    return target ? fetch(target, options) : fetch(url, options);
  }
  const proxy = proxyEndpoint();
  if (!proxy) return fetch(url, options);
  const { ProxyAgent, fetch: proxyFetch } = await import(UNDICI_MODULE) as typeof Undici;
  if (nodeProxy?.url !== proxy) {
    const previous = nodeProxy;
    nodeProxy = { url: proxy, dispatcher: new ProxyAgent(proxy) };
    if (previous) void previous.dispatcher.close().catch(() => {});
  }
  return proxyFetch(url, { ...options, dispatcher: nodeProxy.dispatcher } as unknown as Parameters<typeof proxyFetch>[1]) as unknown as Response;
}

async function request(url: string, options: RequestInit = {}): Promise<Payload> {
  try {
    const response = await sklandFetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json() as Payload;
    if (!response.ok) throw new Error('upstream');
    return data;
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    throw new HTTPError('森空岛服务暂时不可用，请稍后重试', { status: 502 });
  }
}
function success(data: Payload, field: 'code' | 'status') {
  if (data[field] !== 0) throw new HTTPError('森空岛授权失败或已过期，请重新登录', { status: 401 });
  return data.data as Payload;
}
export async function startScan() {
  const data = success(await request(`${HG}/general/v1/gen_scan/login`, { method: 'POST', body: '{}' }), 'status');
  if (typeof data.scanId !== 'string' || typeof data.scanUrl !== 'string') throw new HTTPError('登录服务响应异常', { status: 502 });
  return { scanId: data.scanId, scanUrl: data.scanUrl };
}
export async function scanStatus(scanId: string): Promise<{ status: 'waiting' | 'scanned' | 'expired' | 'ready'; cred?: string }> {
  const result = await request(`${HG}/general/v1/scan_status?${new URLSearchParams({ scanId })}`);
  if (result.status === 100) return { status: 'waiting' };
  if (result.status === 101) return { status: 'scanned' };
  if (result.status === 102) return { status: 'expired' };
  const scan = success(result, 'status');
  const token = success(await request(`${HG}/user/auth/v1/token_by_scan_code`, { method: 'POST', body: JSON.stringify({ scanCode: scan.scanCode }) }), 'status').token;
  return { status: 'ready', cred: await credForToken(token) };
}
export async function credForToken(token: string): Promise<string> {
  const grant = success(await request(`${HG}/user/oauth2/v2/grant`, { method: 'POST', body: JSON.stringify({ type: 0, token, appCode: '4ca99fa6b56cc2ba' }) }), 'status');
  const auth = success(await request(`${SK}/web/v1/user/auth/generate_cred_by_code`, { method: 'POST', body: JSON.stringify({ kind: 1, code: grant.code }) }), 'code');
  if (typeof auth.cred !== 'string' || !auth.cred) throw new HTTPError('登录服务响应异常', { status: 502 });
  return auth.cred;
}
export async function sklandRequest(cred: string, path: string, query: Record<string, string> = {}) {
  const token = success(await request(`${SK}/api/v1/auth/refresh`, { headers: { cred } }), 'code').token;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signed = { platform: '1', timestamp, dId: '', vName: '1.21.0' };
  const search = new URLSearchParams(query).toString();
  const digest = createHmac('sha256', token).update(path + search + timestamp + JSON.stringify(signed)).digest('hex');
  const sign = createHash('md5').update(digest).digest('hex');
  return success(await request(`${SK}${path}${search ? '?' + search : ''}`, { headers: { ...signed, cred, token, sign, 'User-Agent': 'Skland/2.2.0 (com.hypergryph.skland; build:200200057; Android; )' } }), 'code');
}
export async function accountsFor(cred: string): Promise<{ uid: string; name: string; server: string }[]> {
  const data = await sklandRequest(cred, '/api/v1/game/player/binding');
  return (data.list ?? []).filter((game: Payload) => game.appCode === 'arknights').flatMap((game: Payload) => game.bindingList ?? []).map((account: Payload) => ({ uid: String(account.uid), name: String(account.nickName ?? account.nickname ?? '博士'), server: String(account.channelName ?? '官服') }));
}
export async function playerFor(cred: string, uid: string) {
  const [player, cards, cultivate] = await Promise.all([
    sklandRequest(cred, '/api/v1/game/player/info', { uid }),
    sklandRequest(cred, '/api/v1/game/cards'),
    sklandRequest(cred, '/api/v1/game/cultivate/player', { uid }),
  ]);
  return { ...player, cards, cultivate };
}
