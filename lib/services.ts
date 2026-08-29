/**
 * @module lib/services
 * Where the backing service lives.
 *
 * This app is a client. It holds no campus data and talks to no database —
 * every answer, and every campus fact, arrives over HTTP from the brain.
 *
 * There used to be a second address here. The campus data service was retired
 * once the brain served these reads directly, and the last callers of it — the
 * development-only inspector pages — now live in `rockygpt-dev`, so `DATA_URL`
 * and port 8100 are gone from this app entirely rather than kept as a
 * development convenience with no deployment behind it.
 *
 * This address stays server-side. Browser calls use the UI's compatibility
 * routes; native clients can call the brain's public API directly.
 */

/** The address to use when nothing is configured and nothing is deployed. */
const LOCAL_BRAIN_URL = 'http://127.0.0.1:8000';

function trimmed(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/**
 * Whether an unset address may fall back to a local one.
 *
 * In development it may: nothing is deployed and loopback is where the brain
 * is. In production it may not, and the reason is a whole afternoon: with the
 * address unset, every campus route quietly proxied to a loopback address that
 * does not exist inside the deployment, answered 503, and told the browser only
 * "Backing service unavailable." A missing variable and a service that is
 * genuinely down produced the same sentence, so the outage looked like the
 * service was broken rather than like a deployment that had never been given
 * its address.
 */
function mayFallBack(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export interface ServiceAddress {
  /** The address, or null when production has not been given one. */
  url: string | null;
  /** Why there is no address, for readiness to report. */
  problem?: string;
}

export function brainAddress(): ServiceAddress {
  const configured = trimmed(process.env.BRAIN_URL);
  if (configured) return { url: configured };
  if (mayFallBack()) return { url: LOCAL_BRAIN_URL };
  return { url: null, problem: 'BRAIN_URL is not set in this environment.' };
}

/** The answering engine. Read on the server only; the chat route proxies it. */
export const BRAIN_URL = brainAddress().url ?? '';
