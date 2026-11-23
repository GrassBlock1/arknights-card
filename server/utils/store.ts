import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HTTPError, type H3Event } from 'nitro';
import { getCookie, setCookie, setResponseHeader } from 'nitro/h3';
import { useKV } from 'nitro/kv';
import { playerFor } from './skland';
import { cardCacheTtlMs } from './card-cache';
import { singleUserEnabled, assertSingleUserShare, singleUserProfile } from './single-user';

type Account = { uid: string; name: string; server: string };
export type Session = { expires: number; scanId?: string; scanExpires?: number; lastPoll?: number; cred?: string; accounts?: Account[]; bindings: string[] };
type Binding = { owner: string; cred: string; uid: string };
type ProfileSnapshot = { snapshot: Record<string, any>; cachedAt: number };
const idPattern = /^[a-f0-9]{48}$/;
export const newId = () => randomBytes(24).toString('hex');
let keyPromise: Promise<Buffer> | undefined;
async function key() {
  return keyPromise ??= (async () => {
    if (process.env.CARD_ENCRYPTION_KEY) {
      const value = Buffer.from(process.env.CARD_ENCRYPTION_KEY, 'base64');
      if (value.length !== 32) throw new Error('CARD_ENCRYPTION_KEY must encode 32 bytes');
      return value;
    }
    if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') {
      throw new HTTPError('CARD_ENCRYPTION_KEY must be configured as a Cloudflare Workers secret (base64-encoded 32 bytes)', { status: 503 });
    }
    const directory = resolve(process.env.CARD_DATA_DIR || '.data/private');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = resolve(directory, 'encryption.key');
    try { await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    return readFile(path);
  })();
}
async function seal(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
async function unseal<T>(value: string): Promise<T> {
  const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', await key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString());
}
async function load<T>(id: string): Promise<T | null> {
  const value = await useKV('private').getItem<string>(id);
  return value ? unseal<T>(value) : null;
}
async function save(id: string, value: unknown) { await useKV('private').setItem(id, await seal(value)); }
export function protect(event: H3Event, mutate = false) {
  if (singleUserEnabled()) throw new HTTPError('Not Found', { status: 404 });
  setResponseHeader(event, 'Cache-Control', 'no-store');
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer');
  const origin = event.req.headers.get('origin');
  if ((origin && origin !== event.url.origin) || event.req.headers.get('sec-fetch-site') === 'cross-site' || (mutate && !event.req.headers.get('content-type')?.startsWith('application/json'))) {
    throw new HTTPError('请求来源不受信任', { status: 403 });
  }
}
export async function sessionFor(event: H3Event, create = false) {
  let id = getCookie(event, 'card_session') || '';
  let session = idPattern.test(id) ? await load<Session>('session:' + id) : null;
  if (session && session.expires <= Date.now()) { await useKV('private').removeItem('session:' + id); session = null; }
  if (!session && create) {
    id = newId();
    session = { expires: Date.now() + 30 * 86400000, bindings: [] };
    setCookie(event, 'card_session', id, { httpOnly: true, secure: event.url.protocol === 'https:', sameSite: 'strict', path: '/', maxAge: 30 * 86400 });
    await saveSession(id, session);
  }
  if (!session) throw new HTTPError('请先扫码登录', { status: 401 });
  return { id, session };
}
export async function saveSession(id: string, session: Session) { await save('session:' + id, session); }
export async function bind(id: string, session: Session, uid: string) {
  if (!session.cred || !session.accounts?.some(account => account.uid === uid)) throw new HTTPError('角色未授权', { status: 403 });
  if (session.bindings.length >= 20) throw new HTTPError('请先撤销已有绑定', { status: 409 });
  const shareId = newId();
  await save('binding:' + shareId, { owner: id, cred: session.cred, uid } satisfies Binding);
  session.bindings.push(shareId);
  await saveSession(id, session);
  return shareId;
}
const bindingWrites = new Map<string, Promise<void>>();
async function withBindingWrite<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = bindingWrites.get(id) ?? Promise.resolve();
  const work = previous.then(action);
  const settled = work.then(() => {}, () => {});
  bindingWrites.set(id, settled);
  try { return await work; }
  finally { if (bindingWrites.get(id) === settled) bindingWrites.delete(id); }
}
export async function assertBindingAvailable(id: string): Promise<Binding | undefined> {
  if (singleUserEnabled()) {
    assertSingleUserShare(id);
    return;
  }
  if (!idPattern.test(id)) throw new HTTPError('分享 ID 无效', { status: 400 });
  const binding = await load<Binding>('binding:' + id);
  if (!binding) throw new HTTPError('卡片不存在或已撤销', { status: 404 });
  return binding;
}
export async function revoke(id: string, session: Session, shareId: string) {
  await withBindingWrite(shareId, async () => {
    const binding = idPattern.test(shareId) ? await load<Binding>('binding:' + shareId) : null;
    if (!binding || binding.owner !== id) throw new HTTPError('绑定不存在', { status: 404 });
    await useKV('private').removeItem('binding:' + shareId);
    await useKV('private').removeItem('profile:' + shareId);
  });
  session.bindings = session.bindings.filter(value => value !== shareId);
  await saveSession(id, session);
}
const pending = new Map<string, Promise<Record<string, any>>>();
export async function getSharedProfile(id: string): Promise<Record<string, any>> {
  if (singleUserEnabled()) return singleUserProfile(id, cardCacheTtlMs());
  const binding = (await assertBindingAvailable(id))!;
  let work = pending.get(id);
  if (!work) {
    work = Promise.resolve().then(async () => {
      const ttl = cardCacheTtlMs();
      const cached = ttl > 0 ? await load<ProfileSnapshot>('profile:' + id) : null;
      if (cached && Date.now() - cached.cachedAt < ttl) return cached.snapshot;
      const snapshot = await playerFor(binding.cred, binding.uid);
      await withBindingWrite(id, async () => {
        await assertBindingAvailable(id);
        if (ttl > 0) await save('profile:' + id, { snapshot, cachedAt: Date.now() } satisfies ProfileSnapshot);
      });
      return snapshot;
    }).finally(() => pending.delete(id));
    pending.set(id, work);
  }
  const snapshot = await work;
  await assertBindingAvailable(id);
  return snapshot;
}
