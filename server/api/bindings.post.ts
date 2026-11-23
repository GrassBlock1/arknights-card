import { defineHandler, HTTPError } from 'nitro';
import { readBody } from 'nitro/h3';
import { protect, sessionFor, bind } from '../utils/store';
export default defineHandler(async event => {
  protect(event, true);
  const { id, session } = await sessionFor(event);
  const body = await readBody<{ uid?: unknown }>(event);
  if (typeof body?.uid !== 'string') throw new HTTPError('请选择角色', { status: 400 });
  return { id: await bind(id, session, body.uid) };
});
