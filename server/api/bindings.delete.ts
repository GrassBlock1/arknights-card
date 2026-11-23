import { defineHandler, HTTPError } from 'nitro';
import { readBody } from 'nitro/h3';
import { protect, sessionFor, revoke } from '../utils/store';
export default defineHandler(async event => {
  protect(event, true);
  const { id, session } = await sessionFor(event);
  const body = await readBody<{ id?: unknown }>(event);
  if (typeof body?.id !== 'string') throw new HTTPError('缺少分享 ID', { status: 400 });
  await revoke(id, session, body.id);
  return { revoked: true };
});
