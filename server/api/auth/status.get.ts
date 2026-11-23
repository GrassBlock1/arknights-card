import { defineHandler, HTTPError } from 'nitro';
import { protect, sessionFor, saveSession } from '../../utils/store';
import { scanStatus, accountsFor } from '../../utils/skland';
const polling = new Set<string>();
export default defineHandler(async event => {
  protect(event);
  const { id, session } = await sessionFor(event);
  if (!session.scanId && session.cred) return { status: 'ready', accounts: session.accounts };
  if (!session.scanId || (session.scanExpires ?? 0) < Date.now()) return { status: 'expired' };
  if (polling.has(id) || Date.now() - (session.lastPoll ?? 0) < 1500) throw new HTTPError('请稍后查询', { status: 429 });
  polling.add(id);
  try {
    session.lastPoll = Date.now();
    await saveSession(id, session);
    const result = await scanStatus(session.scanId);
    if (result.status === 'ready' && result.cred) {
      const accounts = await accountsFor(result.cred);
      const current = (await sessionFor(event)).session;
      if (current.scanId !== session.scanId) {
        return current.cred ? { status: 'ready', accounts: current.accounts } : { status: 'expired' };
      }
      current.cred = result.cred;
      current.accounts = accounts;
      delete current.scanId;
      await saveSession(id, current);
      return { status: 'ready', accounts };
    }
    return { status: result.status };
  } finally { polling.delete(id); }
});
