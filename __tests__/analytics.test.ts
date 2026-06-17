import { describe, expect, it } from "vitest";
import {
  buildAnalyticsRow,
  dailyVisitorHash,
  deviceFromUA,
  normalizePath,
  referrerHost,
} from "@/lib/analytics";

describe("normalizePath", () => {
  it("strips query/hash and defaults to /", () => {
    expect(normalizePath("/signin?next=/x#frag")).toBe("/signin");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("signup")).toBe("/signup");
  });

  it("collapses dynamic segments so note ids / tokens are never stored", () => {
    expect(normalizePath("/note/abc12345")).toBe("/note/:id");
    expect(normalizePath("/note/abc12345?x=1")).toBe("/note/:id");
    expect(normalizePath("/p/SECRET-token")).toBe("/p/:token");
  });
});

describe("referrerHost", () => {
  it("reduces to host, marks direct/internal", () => {
    expect(referrerHost("https://news.ycombinator.com/item?id=1")).toBe("news.ycombinator.com");
    expect(referrerHost("")).toBe("direct");
    expect(referrerHost("not a url")).toBe("direct");
    expect(referrerHost("https://keeptxt.com/note/x", "keeptxt.com")).toBe("internal");
  });
});

describe("deviceFromUA", () => {
  it("classifies mobile vs desktop", () => {
    expect(deviceFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile");
    expect(deviceFromUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe("desktop");
    expect(deviceFromUA(null)).toBe("desktop");
  });
});

describe("dailyVisitorHash", () => {
  it("is deterministic per day and rotates across days, and stores no raw IP", () => {
    const a = dailyVisitorHash("203.0.113.5", "UA", "2026-06-17");
    const aAgain = dailyVisitorHash("203.0.113.5", "UA", "2026-06-17");
    const nextDay = dailyVisitorHash("203.0.113.5", "UA", "2026-06-18");
    const otherIp = dailyVisitorHash("203.0.113.6", "UA", "2026-06-17");

    expect(a).toBe(aAgain);
    expect(a).not.toBe(nextDay);
    expect(a).not.toBe(otherIp);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toContain("203.0.113.5");
  });
});

describe("buildAnalyticsRow", () => {
  it("applies all redactions", () => {
    const row = buildAnalyticsRow("id1", {
      type: "pageview",
      path: "/note/secret123?ref=x",
      referrer: "https://example.com/path",
      ip: "203.0.113.9",
      ua: "iPhone",
      selfHost: "keeptxt.com",
      now: Date.UTC(2026, 5, 17, 12),
    });
    expect(row).toMatchObject({
      id: "id1",
      type: "pageview",
      path: "/note/:id",
      referrer: "example.com",
      device: "mobile",
    });
    expect(row.visitor).toMatch(/^[0-9a-f]{16}$/);
  });
});
