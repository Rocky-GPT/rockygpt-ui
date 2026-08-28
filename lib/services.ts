/**
 * @module lib/services
 * Where the backing services live.
 *
 * This app is a client. It holds no campus data and talks to no database —
 * every answer, and now every campus fact, arrives over HTTP from the brain.
 *
 * `DATA_URL` is development-only. The campus data service was retired once the
 * brain served these reads directly, and its deployment no longer exists; the
 * only callers left are the `/api/dev/*` inspectors and the pages behind them,
 * which read further into the database than the brain exposes (the entity
 * registry, the data explorer, collector status) and `notFound()` outside
 * development. Point it at a locally running data service to use those pages.
 * Nothing in production reads it, and production is not given a value.
 *
 * These addresses stay server-side. Browser calls use the UI's compatibility
 * routes; native clients can call the brain's public API directly.
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
 * That reasoning still holds for `BRAIN_URL`, which is now the address every
 * campus route depends on, and `/readiness` reports it the same way. It no
 * longer holds for `DATA_URL`: production is deliberately not given one, so
 * `dataAddress()` returning a problem there is the expected state rather than
 * a misconfiguration, and readiness stopped checking it.
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
