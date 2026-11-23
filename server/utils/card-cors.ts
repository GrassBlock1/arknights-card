import { HTTPError, type H3Event } from 'nitro/h3';

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value && !value.includes('*');
  } catch {
    return false;
  }
}

function setCorsHeader(event: H3Event, name: string, value: string): void {
  event.res.headers.set(name, value);
  // H3 deliberately discards ordinary staged headers when rendering errors.
  event.res.errHeaders.set(name, value);
}

export function applyCardCors(event: H3Event): Response | void {
  const { headers, method } = event.req;
  const origin = headers.get('origin');
  const preflight = method === 'OPTIONS';
  const vary = preflight ? 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' : 'Origin';
  for (const target of [event.res.headers, event.res.errHeaders]) target.append('Vary', vary);
  setCorsHeader(event, 'Cache-Control', 'no-store');

  if (origin !== null) {
    // Read configuration per request: Workers expose env only in the request lifecycle.
    const allowed = isOrigin(origin) && (origin === event.url.origin || (process.env.CARD_ALLOWED_ORIGINS || '')
      .split(',').some(entry => {
        const configured = entry.trim();
        return isOrigin(configured) && configured === origin;
      }));
    if (!allowed) throw new HTTPError('Origin not allowed', { status: 403 });
    setCorsHeader(event, 'Access-Control-Allow-Origin', origin);
  }

  if (preflight) {
    const requestedMethod = headers.get('access-control-request-method');
    const requestedHeaders = headers.get('access-control-request-headers');
    if (origin === null || (requestedMethod !== 'GET' && requestedMethod !== 'POST')) {
      throw new HTTPError('CORS preflight method not allowed', { status: 403 });
    }
    if (requestedHeaders !== null && requestedHeaders.split(',').some(header => header.trim().toLowerCase() !== 'content-type')) {
      throw new HTTPError('CORS preflight headers not allowed', { status: 403 });
    }
    setCorsHeader(event, 'Access-Control-Allow-Methods', 'GET, POST');
    if (requestedHeaders !== null) setCorsHeader(event, 'Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204 });
  }

  if (method !== 'GET' && method !== 'POST') {
    setCorsHeader(event, 'Allow', 'GET, POST, OPTIONS');
    throw new HTTPError('Method not allowed', { status: 405 });
  }
}
