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
  it("returns the IP the trusted edge proxy observed (right-most hop)", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 198.51.100.7",
      "x-real-ip": "198.51.100.10",
    });

    expect(clientIpFromHeaders(headers)).toBe("198.51.100.7");
  });

  it("ignores a spoofed leading X-Forwarded-For entry", () => {
    // Attacker prepends a fake IP; our one trusted proxy appends the real peer.
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 203.0.113.10",
    });

    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("honors TRUSTED_PROXY_HOPS for multi-proxy deployments", () => {
    const prev = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "2";
    try {
      const headers = new Headers({
        "x-forwarded-for": "1.2.3.4, 203.0.113.10, 10.0.0.1",
      });
      expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = prev;
    }
  });

  it("falls back to x-real-ip", () => {
    expect(
      clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.10" })),
    ).toBe("198.51.100.10");
  });

  it("fails safe to 'unknown' when the chain is shorter than the hop count", () => {
    const prev = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "3";
    try {
      expect(
        clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4" })),
      ).toBe("unknown");
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = prev;
    }
  });
});

