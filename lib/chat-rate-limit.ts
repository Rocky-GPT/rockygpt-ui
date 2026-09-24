import { createHmac, randomBytes } from 'node:crypto';

const WINDOW_MS = 60_000;
/**
 * Twelve questions a minute per browser tab, and at most 120 a minute from
 * one network address. The limit used to be 12 per address alone, and a
 * campus network puts a whole dorm behind a handful of addresses, so every
 * student on it shared the same twelve. The address ceiling still stops one
 * machine from flooding the model by inventing tab values.
 */
const REQUEST_LIMIT = 12;
const NETWORK_LIMIT = 120;
/** A random per-tab value from the page; see `chatClientToken` in app/page.tsx. */
const CLIENT_HEADER = 'x-rockygpt-client';
const CLIENT_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_BUCKETS = 10_000;
const PRUNE_INTERVAL = 128;
const MINIMUM_SECRET_LENGTH = 32;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

type RateLimitStore = Map<string, RateLimitBucket>;

const sharedState = globalThis as typeof globalThis & {
  __rockyChatRateLimitBuckets?: RateLimitStore;
  __rockyChatRateLimitChecks?: number;
  __rockyLocalAbuseHashKey?: string;
};

const buckets =
  sharedState.__rockyChatRateLimitBuckets ??
  (sharedState.__rockyChatRateLimitBuckets = new Map<string, RateLimitBucket>());

export interface AllowedRateLimit {
  allowed: true;
  limit: number;
  remaining: number;
  resetAt: number;
  clientIdentity: {
    key: string;
    signature?: string;
  };
}

export interface DeniedRateLimit {
  allowed: false;
  limit: number;
  remaining: 0;
  resetAt: number;
  retryAfterSeconds: number;
}

export type ChatRateLimit = AllowedRateLimit | DeniedRateLimit;

function sharedAbuseHashKey(): string | undefined {
  const configured = process.env.ABUSE_HASH_KEY?.trim();
  return configured && configured.length >= MINIMUM_SECRET_LENGTH ? configured : undefined;
}

function localAbuseHashKey(): string {
  return (
    sharedState.__rockyLocalAbuseHashKey ??
    (sharedState.__rockyLocalAbuseHashKey = randomBytes(32).toString('hex'))
  );
}

/**
 * The hosting proxy must replace, rather than append to, these headers. That
 * trust boundary is called out in .env.example; the application itself has no
 * socket address available through the Web Request API.
 */
function sourceNetworkAddress(request: Request): string {
  const direct =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0];
  const normalized = direct?.trim();
  return normalized ? normalized.slice(0, 128) : 'unavailable';
}

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Bound memory even if an attacker continually presents new addresses.
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

function take(key: string, limit: number, now: number): { bucket: RateLimitBucket; full: boolean } {
  const previous = buckets.get(key);
  const bucket =
    !previous || previous.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : previous;
  return { bucket, full: bucket.count >= limit };
}

function spend(key: string, bucket: RateLimitBucket): void {
  bucket.count += 1;
  // Refresh insertion order so the size bound behaves as a simple LRU.
  buckets.delete(key);
  buckets.set(key, bucket);
}

/**
 * Per-process fixed-window protection for the model-backed chat endpoint.
 * The source address and the tab value are immediately combined with a keyed
 * HMAC; neither the raw values nor the digests are written to logs or durable
 * storage, and a bucket lives in memory for one minute.
 *
 * This intentionally is not presented as a distributed quota. Multi-instance
 * deployments should replace the Map with a shared atomic store while keeping
 * the same result contract.
 */
export function checkChatRateLimit(request: Request, now = Date.now()): ChatRateLimit {
  const sharedKey = sharedAbuseHashKey();
  const hashKey = sharedKey ?? localAbuseHashKey();

  sharedState.__rockyChatRateLimitChecks = (sharedState.__rockyChatRateLimitChecks ?? 0) + 1;
  if (sharedState.__rockyChatRateLimitChecks % PRUNE_INTERVAL === 0 || buckets.size >= MAX_BUCKETS) {
    pruneExpiredBuckets(now);
  }

  const address = sourceNetworkAddress(request);
  const token = request.headers.get(CLIENT_HEADER)?.trim();
  const digest = (value: string) => createHmac('sha256', hashKey).update(value).digest('hex');
  // Without a tab value (older pages, scripts) the address is the client, as
  // before; with one, each tab has its own window under the address ceiling.
  const clientKey = token && CLIENT_TOKEN.test(token)
    ? digest(`tab:${address}:${token}`)
    : digest(address);
  const networkKey = token && CLIENT_TOKEN.test(token) ? digest(`network:${address}`) : null;

  const client = take(clientKey, REQUEST_LIMIT, now);
  const network = networkKey ? take(networkKey, NETWORK_LIMIT, now) : null;
  const blocking = client.full ? client : network?.full ? network : null;
  if (blocking) {
    return {
      allowed: false,
      limit: blocking === client ? REQUEST_LIMIT : NETWORK_LIMIT,
      remaining: 0,
      resetAt: blocking.bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((blocking.bucket.resetAt - now) / 1_000)),
    };
  }

  spend(clientKey, client.bucket);
  if (networkKey && network) spend(networkKey, network.bucket);
  return {
    allowed: true,
    limit: REQUEST_LIMIT,
    remaining: REQUEST_LIMIT - client.bucket.count,
    resetAt: client.bucket.resetAt,
    clientIdentity: {
      key: clientKey,
      ...(sharedKey
        ? { signature: createHmac('sha256', sharedKey).update(clientKey).digest('hex') }
        : {}),
    },
  };
}

export function rateLimitHeaders(result: ChatRateLimit): HeadersInit {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1_000)),
  };
  if (!result.allowed) headers['Retry-After'] = String(result.retryAfterSeconds);
  return headers;
}
