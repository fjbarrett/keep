import { describe, expect, it } from "vitest";
import { buildAuditRow } from "@/lib/audit";

const headers = (h: Record<string, string>) => new Headers(h);

describe("buildAuditRow", () => {
  it("masks the client IP to its network and caps the user-agent", () => {
    const row = buildAuditRow("id1", 1000, "login.failure", {
      userId: "u1",
      headers: headers({
        "x-forwarded-for": "203.0.113.42, 10.0.0.1",
        "user-agent": "x".repeat(500),
      }),
      meta: { method: "password", reason: "bad_password" },
    });

    expect(row).toMatchObject({
      id: "id1",
      ts: 1000,
      event: "login.failure",
      userId: "u1",
      ip: "203.0.x.x",
      meta: { method: "password", reason: "bad_password" },
    });
    expect(row.userAgent).toHaveLength(256);
  });

  it("never stores a raw, full IP", () => {
    const row = buildAuditRow("id2", 1, "login.success", {
      headers: headers({ "x-forwarded-for": "198.51.100.7" }),
    });
    expect(row.ip).toBe("198.51.x.x");
    expect(row.ip).not.toContain("100.7");
  });

  it("defaults userId/ip/userAgent to null and meta to {} when absent", () => {
    const row = buildAuditRow("id3", 2, "register", {});
    expect(row).toMatchObject({ userId: null, ip: null, userAgent: null, meta: {} });
  });

  it("drops an unresolvable IP rather than storing the 'unknown' sentinel", () => {
    const row = buildAuditRow("id4", 3, "register", { headers: headers({}) });
    expect(row.ip).toBeNull();
  });
});
