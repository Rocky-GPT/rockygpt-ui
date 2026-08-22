import 'server-only';
import { brainUrl } from './brain-api';
import { DATA_URL } from './services';

const RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'etag',
  'last-modified',
  'x-rockygpt-release',
  'x-rockygpt-data-source',
];

function forwardedHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function proxy(request: Request, url: string, admin = false): Promise<Response> {
  const headers = new Headers({ accept: request.headers.get('accept') || 'application/json' });
  const contentType = request.headers.get('content-type');
  const ifNoneMatch = request.headers.get('if-none-match');
  if (contentType) headers.set('content-type', contentType);
  if (ifNoneMatch) headers.set('if-none-match', ifNoneMatch);
  const environmentToken = process.env.STAGING_SERVICE_TOKEN?.trim();
  if (environmentToken) headers.set('x-rockygpt-environment-token', environmentToken);
  if (admin) {
    const token = process.env.ADMIN_API_TOKEN?.trim();
    if (!token) return Response.json({ error: 'Admin service is not configured.' }, { status: 503 });
    headers.set('authorization', `Bearer ${token}`);
  }

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: forwardedHeaders(upstream),
    });
  } catch (error) {
    console.error(`Service proxy failed for ${url}:`, error);
    return Response.json({ error: 'Backing service unavailable.' }, { status: 503 });
  }
}

export function proxyData(request: Request, path: string): Promise<Response> {
  return proxy(request, `${DATA_URL}${path.startsWith('/') ? path : `/${path}`}`);
}

export function proxyBrain(request: Request, path: string, admin = false): Promise<Response> {
  return proxy(request, `${brainUrl()}${path.startsWith('/') ? path : `/${path}`}`, admin);
}
