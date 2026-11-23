import { defineHandler, HTTPError } from 'nitro';
import { getQuery, readBody, setHeader } from 'nitro/h3';
import { resolveCard } from '../utils/card-data';

export default defineHandler(async (event) => {
  const method = event.req.method;
  if (method !== 'GET' && method !== 'POST') throw new HTTPError('Method not allowed', { status: 405 });
  setHeader(event, 'Cache-Control', 'no-store');
  const input = method === 'POST' ? await readBody(event) : getQuery(event);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HTTPError('请求必须为 JSON 对象', { status: 400 });
  return resolveCard(input as Record<string, unknown>);
});
