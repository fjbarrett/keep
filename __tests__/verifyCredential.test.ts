import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), hash: vi.fn() }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/password", () => ({ passwordIssue: (p: string) => p.length < 10 ? "Too short" : null, hashPassword: mocks.hash }));
import { GET, POST } from "@/app/api/auth/verify/route";
const token = "a".repeat(64);
let ip = 0;
const request = (data = { token, password: "mailbox-owner-password" }, origin?: string) => new Request("https://keeptxt.com/api/auth/verify", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${++ip}`, ...(origin ? { origin } : {}) }, body: JSON.stringify(data),
});
beforeEach(() => { vi.resetAllMocks(); mocks.hash.mockResolvedValue("owner-hash"); });
it("does not activate an old pre-registration password when a link is followed", async () => {
  const response = await GET(new Request(`https://keeptxt.com/api/auth/verify?token=${token}`));
  expect(response.headers.get("location")).toBe(`https://keeptxt.com/signup?token=${token}`);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("replaces the old credential only with the password supplied alongside mailbox proof", async () => {
  mocks.query.mockResolvedValue({ rows: [{ id: "pending-user" }] });
  expect((await POST(request())).status).toBe(200);
  expect(mocks.hash).toHaveBeenCalledWith("mailbox-owner-password");
  const [sql, params] = mocks.query.mock.calls[1];
  expect(sql).toContain("SET password_hash = $1");
  expect(sql).toContain("email_verified IS NULL");
  expect(sql).toContain("verify_token = NULL");
  expect(params).toEqual(["owner-hash", expect.any(Number), token]);
});
it("rejects expired/replayed tokens without hashing", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  expect((await POST(request())).status).toBe(400);
  expect(mocks.hash).not.toHaveBeenCalled();
});
it("fails if the token expires, is rotated, or the account is adopted while hashing", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [{ id: "pending-user" }] }).mockResolvedValueOnce({ rows: [] });
  expect((await POST(request())).status).toBe(400);
});
it("rejects cross-origin, malformed and weak-password requests before touching the database", async () => {
  expect((await POST(request(undefined, "https://attacker.example"))).status).toBe(403);
  expect((await POST(request({ token: "bad", password: "long-enough-password" }))).status).toBe(400);
  expect((await POST(request({ token, password: "short" }))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
