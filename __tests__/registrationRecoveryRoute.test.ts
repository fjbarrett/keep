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
  it.each([null, 1])("preserves an existing account, including when verification is %s", async (verified) => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "existing", email_verified: verified }] });
    const response = await register(request("register"));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("request a new verification email");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("SELECT"), ["person@example.com"]);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns recovery instructions when another signup wins the insert race", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const response = await register(request("register"));
    expect(response.status).toBe(409);
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
