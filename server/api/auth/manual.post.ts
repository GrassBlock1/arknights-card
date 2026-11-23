import { defineHandler, HTTPError } from 'nitro';
import { protect, sessionFor, saveSession } from '../../utils/store';
import { accountsFor, credForToken } from '../../utils/skland';

export default defineHandler(async event => {
  protect(event, true);
  if (event.req.headers.get('origin') !== event.url.origin) throw new HTTPError('请求来源不受信任', { status: 403 });
  const hostname = event.url.hostname;
  const loopback = hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.(?:\d{1,3})){3}$/.test(hostname);
  if (event.url.protocol !== 'https:' && !loopback) throw new HTTPError('手动登录需要 HTTPS，请使用安全连接', { status: 403 });
  const reader = event.req.body?.getReader();
  if (!reader) throw new HTTPError('请输入登录凭证', { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new HTTPError('登录凭证过长', { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: { type?: unknown; value?: unknown } | null;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HTTPError('登录凭证格式无效', { status: 400 }); }
  if (!body || (body.type !== 'token' && body.type !== 'cred') || typeof body.value !== 'string' || !body.value.trim() || body.value.length > 4096 || /\s/.test(body.value.trim())) {
    throw new HTTPError('请选择凭证类型，并填写有效的 token 或 cred 字符串', { status: 400 });
  }
  const cred = body.type === 'token' ? await credForToken(body.value.trim()) : body.value.trim();
  const accounts = await accountsFor(cred);
  const { id, session } = await sessionFor(event, true);
  session.cred = cred;
  session.accounts = accounts;
  delete session.scanId;
  delete session.scanExpires;
  delete session.lastPoll;
  await saveSession(id, session);
  return { accounts };
});
