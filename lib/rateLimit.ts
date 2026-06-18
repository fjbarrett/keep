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

// How many proxies we operate sit in front of the app (Caddy in prod = 1). Only
// the right-most TRUSTED_PROXY_HOPS entries of X-Forwarded-For are appended by
// hops we control; everything to their left is client-supplied and spoofable.
function trustedProxyHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function clientIpFromHeaders(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    // Count in from the right to the IP our own edge proxy actually observed,
    // so a spoofed leading "X-Forwarded-For: 1.2.3.4" can't masquerade as the
    // client. Too-short a chain (misconfigured hop count) yields undefined and
    // falls through to the safe "unknown" rather than trusting a spoofed value.
    const ip = chain[chain.length - trustedProxyHops()];
    if (ip) return ip;
  }

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
