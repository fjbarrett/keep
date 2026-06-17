import { describe, expect, it } from "vitest";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit, rateLimitResponse } from "@/lib/rateLimitGuard";

describe("enforceIpRateLimit", () => {
  it("returns null while under budget, then a 429 once exhausted", () => {
    const limiter = createTokenBucketRateLimiter({ limit: 1, windowMs: 60_000 });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });

    expect(enforceIpRateLimit(limiter, headers, "test", "slow down")).toBeNull();

    const blocked = enforceIpRateLimit(limiter, headers, "test", "slow down");
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
  });

  it("keys by client IP so different callers don't share a budget", () => {
    const limiter = createTokenBucketRateLimiter({ limit: 1, windowMs: 60_000 });
    const a = new Headers({ "x-forwarded-for": "203.0.113.5" });
    const b = new Headers({ "x-forwarded-for": "203.0.113.6" });

    expect(enforceIpRateLimit(limiter, a, "test", "x")).toBeNull();
    expect(enforceIpRateLimit(limiter, a, "test", "x")?.status).toBe(429);
    expect(enforceIpRateLimit(limiter, b, "test", "x")).toBeNull();
  });

  it("scopes the bucket so unrelated endpoints don't share a budget", () => {
    const limiter = createTokenBucketRateLimiter({ limit: 1, windowMs: 60_000 });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });

    expect(enforceIpRateLimit(limiter, headers, "scope-a", "x")).toBeNull();
    expect(enforceIpRateLimit(limiter, headers, "scope-b", "x")).toBeNull();
  });
});

describe("rateLimitResponse", () => {
  it("carries the rate-limit headers and message", async () => {
    const res = rateLimitResponse(
      { allowed: false, limit: 5, remaining: 0, retryAfter: 3 },
      "slow down",
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    await expect(res.json()).resolves.toEqual({ error: "slow down" });
  });
});
