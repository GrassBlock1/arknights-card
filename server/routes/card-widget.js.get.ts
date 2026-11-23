import { defineHandler } from 'nitro';
import source from 'virtual:card-widget-source';

export default defineHandler(() => new Response(source, {
  headers: {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  },
}));
