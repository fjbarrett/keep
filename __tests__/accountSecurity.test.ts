// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), hash: vi.fn(), verify: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/audit", () => ({ recordSecurityEvent: async () => {} }));
vi.mock("@/lib/password", async (original) => ({ ...await original<typeof import("@/lib/password")>(), hashPassword: mocks.hash, verifyPassword: mocks.verify }));
import { POST as password } from "@/app/api/auth/password/route";
import { POST as revoke } from "@/app/api/auth/revoke/route";
const request = (body: unknown = {}, origin = "same-origin") => new Request("https://keep.test/api/auth/password", {
  method: "POST", headers: { "sec-fetch-site": origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: crypto.randomUUID() }, authenticatedAt: Date.now() });
  mocks.hash.mockResolvedValue("derived-hash");
  mocks.verify.mockResolvedValue(false);
});
it("requires an authenticated same-origin request for account changes", async () => {
  expect((await password(request({}, "cross-site"))).status).toBe(403);
  mocks.auth.mockResolvedValue(null);
  expect((await password(request())).status).toBe(401);
  expect((await revoke(request())).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("verifies the current credential before hashing a replacement", async () => {
  mocks.query.mockResolvedValue({ rows: [{ password_hash: "existing-hash", email_verified: "1" }] });
  const response = await password(request({ password: "a new long password", currentPassword: "wrong" }));
  expect(response.status).toBe(403);
  expect(mocks.verify).toHaveBeenCalledWith("wrong", "existing-hash");
  expect(mocks.hash).not.toHaveBeenCalled();
});
it("requires a fresh sign-in to add a first password", async () => {
  mocks.auth.mockResolvedValue({ user: { id: crypto.randomUUID() }, authenticatedAt: Date.now() - 11 * 60_000 });
  mocks.query.mockResolvedValue({ rows: [{ password_hash: null, email_verified: "1" }] });
  expect((await password(request({ password: "a new long password" }))).status).toBe(403);
  expect(mocks.hash).not.toHaveBeenCalled();
});
it("sets a password atomically and revokes previous sessions", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [{ password_hash: null, email_verified: "1" }] })
    .mockResolvedValueOnce({ rows: [{ id: "owner" }] });
  expect((await password(request({ password: "a new long password" }))).status).toBe(200);
  expect(mocks.query.mock.calls[1][0]).toContain("session_version = session_version + 1");
  expect(mocks.query.mock.calls[1][0]).toContain("password_hash IS NOT DISTINCT FROM $4");
  expect(mocks.query.mock.calls[1][1][0]).toBe("derived-hash");
});
it("scopes explicit session revocation to the authenticated owner", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "owner-to-revoke" } });
  mocks.query.mockResolvedValue({ rows: [] });
  expect((await revoke(request())).status).toBe(200);
  expect(mocks.query.mock.calls[0][0]).toContain("WHERE id = $2");
  expect(mocks.query.mock.calls[0][1][1]).toBe("owner-to-revoke");
});
