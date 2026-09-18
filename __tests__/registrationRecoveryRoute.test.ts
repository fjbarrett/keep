import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), send: vi.fn(), hash: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }), newId: () => "new-user" }));
vi.mock("@/lib/password", () => ({ passwordIssue: () => null, hashPassword: mocks.hash }));
vi.mock("@/lib/email", () => ({ sendVerificationEmail: mocks.send }));
vi.mock("@/lib/audit", () => ({ recordSecurityEvent: mocks.audit }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() }, maskEmail: () => "p***@example.com" }));

import { POST as register } from "@/app/api/auth/register/route";
import { POST as resend } from "@/app/api/auth/resend/route";

let sequence = 0;
function request(route: string) {
  return new Request(`https://keeptxt.com/api/auth/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${++sequence}` },
    body: JSON.stringify({ email: "Person@example.com", password: "new-password" }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hash.mockResolvedValue("new-hash");
  mocks.send.mockResolvedValue(undefined);
});

describe("registration recovery routes", () => {
  it.each([null, 1])("answers success for a held address, including when verification is %s", async (verified) => {
    // A 409 here would let anyone probe which addresses hold accounts, so the
    // endpoint answers the same success as a fresh signup. Recovery still
    // works: an unverified holder gets a fresh link inline.
    const heldVerified = verified === 1;
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "existing", email_verified: verified }] })
      .mockResolvedValueOnce({ rows: heldVerified ? [] : [{ id: "existing" }] });
    const response = await register(request("register"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), ["person@example.com"]);
    const updateSql = String(mocks.query.mock.calls[1][0]);
    expect(updateSql).toContain("email_verified IS NULL");
    expect(updateSql).not.toContain("password_hash");
    expect(mocks.hash).not.toHaveBeenCalled();
    if (heldVerified) {
      expect(mocks.send).not.toHaveBeenCalled();
    } else {
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(String(mocks.send.mock.calls[0][1])).toContain("/api/auth/verify?token=");
    }
  });

  it("returns success when another signup wins the insert race", async () => {
    // The loser must not 409: that status would reopen the oracle the
    // held-address path just closed. The winner's request delivers the link.
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const response = await register(request("register"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.query.mock.calls[1][0]).toContain("ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("saves a new account and supplies recovery if email delivery fails", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "new-user" }] });
    mocks.send.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await register(request("register"));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("Request a new verification email");
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("reports a resend outage instead of falsely claiming delivery", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "existing" }] });
    mocks.send.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await resend(request("resend"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Verification email is temporarily unavailable. Try again shortly." });
    const sql = mocks.query.mock.calls[0][0];
    expect(sql).toContain("email_verified IS NULL");
    expect(sql).not.toContain("password_hash");
  });
});
