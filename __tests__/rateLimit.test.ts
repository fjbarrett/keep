import { describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  createTokenBucketRateLimiter,
} from "@/lib/rateLimit";

describe("createTokenBucketRateLimiter", () => {
  it("allows a burst up to the configured limit", () => {
    const rateLimit = createTokenBucketRateLimiter({ limit: 2, windowMs: 1000 });

    expect(rateLimit("ip:one", 0).allowed).toBe(true);
    expect(rateLimit("ip:one", 0).allowed).toBe(true);

    const blocked = rateLimit("ip:one", 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(1);
  });

  it("refills tokens over time", () => {
    const rateLimit = createTokenBucketRateLimiter({ limit: 2, windowMs: 1000 });

    rateLimit("ip:one", 0);
    rateLimit("ip:one", 0);

    expect(rateLimit("ip:one", 499).allowed).toBe(false);
    expect(rateLimit("ip:one", 500).allowed).toBe(true);
  });

  it("tracks different keys independently", () => {
    const rateLimit = createTokenBucketRateLimiter({ limit: 1, windowMs: 1000 });

    expect(rateLimit("ip:one", 0).allowed).toBe(true);
    expect(rateLimit("ip:one", 0).allowed).toBe(false);
    expect(rateLimit("ip:two", 0).allowed).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("uses the first forwarded IP", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "x-real-ip": "198.51.100.10",
    });

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip", () => {
    expect(
      clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.10" })),
    ).toBe("198.51.100.10");
  });
});

