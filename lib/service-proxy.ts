import 'server-only';
import { brainAddress } from './services';

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

async function proxy(request: Request, url: string): Promise<Response> {
  const headers = new Headers({ accept: request.headers.get('accept') || 'application/json' });
  const contentType = request.headers.get('content-type');
  const ifNoneMatch = request.headers.get('if-none-match');
  if (contentType) headers.set('content-type', contentType);
  if (ifNoneMatch) headers.set('if-none-match', ifNoneMatch);
  const environmentToken = process.env.STAGING_SERVICE_TOKEN?.trim();
  if (environmentToken) headers.set('x-rockygpt-environment-token', environmentToken);
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
    return unavailable('Backing service unavailable.', 'unreachable');
  }
}

/**
 * A refusal the caller can tell apart from data.
 *
 * `reason` exists because the browser could not: an unset address and a
 * service that is down both arrived as the same 503 sentence, so a deployment
 * that had never been given an address was indistinguishable from an outage.
 */
function unavailable(message: string, reason: 'unreachable' | 'misconfigured'): Response {
  return Response.json({ error: message, reason }, { status: 503 });
}

export function proxyBrain(request: Request, path: string): Promise<Response> {
  const { url, problem } = brainAddress();
  if (url === null) {
    console.error(`The brain is not configured: ${problem}`);
    return Promise.resolve(
      unavailable('The answering engine is not configured for this deployment.', 'misconfigured')
    );
  }
  return proxy(request, `${url}${path.startsWith('/') ? path : `/${path}`}`);
}
