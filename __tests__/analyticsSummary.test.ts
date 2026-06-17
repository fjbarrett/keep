import { afterEach, describe, expect, it } from "vitest";
import { fillDays, isAnalyticsOwner } from "@/lib/analyticsSummary";

afterEach(() => {
  delete process.env.ANALYTICS_ADMIN_EMAIL;
});

describe("fillDays", () => {
  it("zero-fills the whole window, oldest → newest, merging known days", () => {
    const now = Date.UTC(2026, 5, 17, 12);
    const out = fillDays([{ day: "2026-06-16", views: 5 }], 3, now);
    expect(out).toEqual([
      { day: "2026-06-15", views: 0 },
      { day: "2026-06-16", views: 5 },
      { day: "2026-06-17", views: 0 },
    ]);
  });
});

describe("isAnalyticsOwner", () => {
  it("is false when no admin email is configured", () => {
    expect(isAnalyticsOwner("a@b.com")).toBe(false);
  });

  it("matches case-insensitively when configured", () => {
    process.env.ANALYTICS_ADMIN_EMAIL = "Owner@Example.com";
    expect(isAnalyticsOwner("owner@example.com")).toBe(true);
    expect(isAnalyticsOwner("someone@else.com")).toBe(false);
    expect(isAnalyticsOwner(null)).toBe(false);
  });
});
