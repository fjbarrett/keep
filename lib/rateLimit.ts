type Bucket = {
  tokens: number;
  updatedAt: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
};

export type TokenBucketOptions = {
  limit: number;
  windowMs: number;
  maxEntries?: number;
};

const DEFAULT_MAX_ENTRIES = 10_000;

export function clientIpFromHeaders(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

export function createTokenBucketRateLimiter({
  limit,
  windowMs,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: TokenBucketOptions) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;

  function sweep(now: number) {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;

    for (const [key, bucket] of buckets) {
      const refilled = refill(bucket, now, limit, windowMs);
      if (refilled.tokens >= limit && now - refilled.updatedAt >= windowMs) {
        buckets.delete(key);
      }
    }

    if (buckets.size <= maxEntries) return;
    const overflow = buckets.size - maxEntries;
    let deleted = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      deleted++;
      if (deleted >= overflow) break;
    }
  }

  return function rateLimit(key: string, now = Date.now()): RateLimitDecision {
    sweep(now);

    const safeKey = key || "unknown";
    const bucket = refill(
      buckets.get(safeKey) ?? { tokens: limit, updatedAt: now },
      now,
      limit,
      windowMs,
    );

    if (bucket.tokens < 1) {
      buckets.set(safeKey, bucket);
      const retryAfterMs = Math.ceil(((1 - bucket.tokens) * windowMs) / limit);
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    bucket.tokens -= 1;
    buckets.set(safeKey, bucket);
    return {
      allowed: true,
      limit,
      remaining: Math.floor(bucket.tokens),
      retryAfter: 0,
    };
  };
}

function refill(bucket: Bucket, now: number, limit: number, windowMs: number) {
  const elapsed = Math.max(0, now - bucket.updatedAt);
  if (elapsed === 0) return { ...bucket };

  const refillRate = limit / windowMs;
  return {
    tokens: Math.min(limit, bucket.tokens + elapsed * refillRate),
    updatedAt: now,
  };
}
