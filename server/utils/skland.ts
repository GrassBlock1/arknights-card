import { createHash, createHmac } from 'node:crypto';
import { HTTPError } from 'nitro';

const HG = 'https://as.hypergryph.com';
const SK = 'https://zonai.skland.com';
type Payload = Record<string, any>;

async function request(url: string, options: RequestInit = {}): Promise<Payload> {
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json() as Payload;
    if (!response.ok) throw new Error('upstream');
    return data;
  } catch {
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
