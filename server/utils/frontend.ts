import { HTTPError } from 'nitro';

export function workbenchEnabled(): boolean {
  const value = process.env.CARD_DISABLE_FRONTEND;
  if (value === undefined || value === 'false') return true;
  if (value === 'true') return false;
  throw new HTTPError('CARD_DISABLE_FRONTEND 配置无效', { status: 503 });
}
