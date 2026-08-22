import { createHmac, randomBytes } from 'node:crypto';

const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 12;
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

/**
 * Per-process fixed-window protection for the model-backed chat endpoint.
 * The source address is immediately transformed with a keyed HMAC; neither
 * the raw address nor the digest is written to logs or durable storage.
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

  const key = createHmac('sha256', hashKey)
    .update(sourceNetworkAddress(request))
    .digest('hex');
  const previous = buckets.get(key);
  const bucket =
    !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + WINDOW_MS }
      : previous;

  if (bucket.count >= REQUEST_LIMIT) {
    return {
      allowed: false,
      limit: REQUEST_LIMIT,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
    };
  }

  bucket.count += 1;
  // Refresh insertion order so the size bound behaves as a simple LRU.
  buckets.delete(key);
  buckets.set(key, bucket);
  return {
    allowed: true,
    limit: REQUEST_LIMIT,
    remaining: REQUEST_LIMIT - bucket.count,
    resetAt: bucket.resetAt,
    clientIdentity: {
      key,
      ...(sharedKey
        ? { signature: createHmac('sha256', sharedKey).update(key).digest('hex') }
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
