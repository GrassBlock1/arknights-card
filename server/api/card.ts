import { defineHandler, HTTPError } from 'nitro';
import { getQuery, readBody } from 'nitro/h3';
import { resolveCard } from '../utils/card-data';
import { applyCardCors } from '../utils/card-cors';

export default defineHandler(async (event) => {
  const preflight = applyCardCors(event);
  if (preflight) return preflight;
  const method = event.req.method;
  const input = method === 'POST' ? await readBody(event) : getQuery(event);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HTTPError('请求必须为 JSON 对象', { status: 400 });
  return resolveCard(input as Record<string, unknown>);
});
