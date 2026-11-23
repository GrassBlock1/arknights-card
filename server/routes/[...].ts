import { defineHandler, HTTPError } from 'nitro';
import { workbenchEnabled } from '../utils/frontend.ts';

export default defineHandler(() => {
  if (!workbenchEnabled()) throw new HTTPError('Not Found', { status: 404 });
});
