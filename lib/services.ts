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

/** The address to use when nothing is configured and nothing is deployed. */
const LOCAL_DATA_URL = 'http://127.0.0.1:8100';
const LOCAL_BRAIN_URL = 'http://127.0.0.1:8000';

function trimmed(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/**
 * Whether an unset address may fall back to a local one.
 *
 * In development it may: nothing is deployed and loopback is where the
 * services are. In production it may not, and the reason is a whole afternoon:
 * with `DATA_URL` unset, every campus-data route quietly proxied to a
 * loopback address that does not exist inside the deployment, answered 503,
 * and told the browser only "Backing service unavailable." A missing variable
 * and a service that is genuinely down produced the same sentence, so the
 * outage looked like the data service was broken rather than like a
 * deployment that had never been given its address.
 *
 * Unset in production is a configuration failure and now says so — at
 * `/readiness`, where a deploy check can see it, rather than one panel at a
 * time in someone's browser.
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

function address(name: 'DATA_URL' | 'BRAIN_URL', local: string): ServiceAddress {
  const configured = trimmed(process.env[name]);
  if (configured) return { url: configured };
  if (mayFallBack()) return { url: local };
  return { url: null, problem: `${name} is not set in this environment.` };
}

export function dataAddress(): ServiceAddress {
  return address('DATA_URL', LOCAL_DATA_URL);
}

export function brainAddress(): ServiceAddress {
  return address('BRAIN_URL', LOCAL_BRAIN_URL);
}

/**
 * The campus data service.
 *
 * Empty rather than loopback when production is unconfigured, so a request
 * built on it fails as a bad address instead of travelling somewhere real.
 * Prefer `dataAddress()` where the difference between "unset" and "down"
 * matters; this stays for call sites that only build a URL.
 */
export const DATA_URL = dataAddress().url ?? '';

/** The answering engine. Read on the server only; the chat route proxies it. */
export const BRAIN_URL = brainAddress().url ?? '';
