/**
 * @module lib/services
 * Where the backing services live.
 *
 * This app is a client. It holds no campus data and talks to no database —
 * everything it shows arrives over HTTP from the data service, and every
 * answer from the brain. A native client would use the same two addresses.
 *
 * These addresses stay server-side. Browser calls use the UI's compatibility
 * routes; native clients can call the same public data API directly.
 */

/** The campus data service. */
export const DATA_URL = (
  process.env.DATA_URL || 'http://127.0.0.1:8100'
).replace(/\/+$/, '');

/** The answering engine. Read on the server only; the chat route proxies it. */
export const BRAIN_URL = (process.env.BRAIN_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

/** Builds a URL against the data service. */
export function dataUrl(path: string, params?: Record<string, string | undefined>): string {
  const url = new URL(`${DATA_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  return url.toString();
}
