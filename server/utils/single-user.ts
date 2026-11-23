import { createHash, timingSafeEqual } from 'node:crypto';
import { HTTPError } from 'nitro';
import { credForToken, playerFor } from './skland.ts';

type Configuration = { type: 'token' | 'cred'; credential: string; uid: string; shareId: string; fingerprint: string };
export function singleUserEnabled(): boolean {
  const value = process.env.CARD_SINGLE_USER;
  if (value === undefined || value === 'true') return true;
  if (value === 'false') return false;
  throw configurationError();
}
function configurationError() { return new HTTPError('单用户配置无效', { status: 503 }); }
function configuration(): Configuration {
  const type = process.env.CARD_SKLAND_CREDENTIAL_TYPE;
  const credential = process.env.CARD_SKLAND_CREDENTIAL;
  const uid = process.env.CARD_SKLAND_UID;
  const shareId = process.env.CARD_SINGLE_USER_SHARE_ID;
  if ((type !== 'token' && type !== 'cred') || !credential || credential.length > 4096 || /\s/.test(credential) || !uid || !/^\d+$/.test(uid) || !shareId || !/^[A-Za-z0-9_-]{24,256}$/.test(shareId)) throw configurationError();
  const fingerprint = createHash('sha256').update(JSON.stringify([type, credential, uid, shareId])).digest('hex');
  return { type, credential, uid, shareId, fingerprint };
}
export function publicConfiguration(): { singleUser: boolean } {
  const singleUser = singleUserEnabled();
  return { singleUser };
}
export function assertSingleUserShare(id: string): void {
  const shareId = process.env.CARD_SINGLE_USER_SHARE_ID || '';
  const actual = createHash('sha256').update(id).digest();
  const expected = createHash('sha256').update(shareId).digest();
  if (!timingSafeEqual(actual, expected) || !/^[A-Za-z0-9_-]{24,256}$/.test(shareId)) throw new HTTPError('卡片不存在或已撤销', { status: 404 });
  configuration();
}
let credentialCache: { fingerprint: string; value: Promise<string> } | undefined;
let snapshotCache: { fingerprint: string; snapshot: Record<string, any>; cachedAt: number } | undefined;
let pending: { fingerprint: string; value: Promise<Record<string, any>> } | undefined;
export async function singleUserProfile(id: string, ttl: number): Promise<Record<string, any>> {
  assertSingleUserShare(id);
  const config = configuration();
  if (snapshotCache?.fingerprint === config.fingerprint && ttl > 0 && Date.now() - snapshotCache.cachedAt < ttl) return snapshotCache.snapshot;
  let work = pending?.fingerprint === config.fingerprint ? pending.value : undefined;
  if (!work) {
    work = Promise.resolve().then(async () => {
      if (credentialCache?.fingerprint !== config.fingerprint) {
        const value = config.type === 'cred' ? Promise.resolve(config.credential) : credForToken(config.credential);
        const entry = { fingerprint: config.fingerprint, value };
        credentialCache = entry;
        void value.catch(() => { if (credentialCache === entry) credentialCache = undefined; });
      }
      const credentialEntry = credentialCache;
      let snapshot: Record<string, any>;
      try { snapshot = await playerFor(await credentialEntry.value, config.uid); }
      catch (error) {
        if (credentialCache === credentialEntry) credentialCache = undefined;
        throw error;
      }
      if (singleUserEnabled() && configuration().fingerprint === config.fingerprint && ttl > 0) snapshotCache = { fingerprint: config.fingerprint, snapshot, cachedAt: Date.now() };
      return snapshot;
    }).finally(() => { if (pending?.value === work) pending = undefined; });
    pending = { fingerprint: config.fingerprint, value: work };
  }
  const snapshot = await work;
  if (!singleUserEnabled() || configuration().fingerprint !== config.fingerprint) throw configurationError();
  assertSingleUserShare(id);
  return snapshot;
}
