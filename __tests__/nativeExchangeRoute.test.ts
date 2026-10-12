import { describe, expect, it, vi, afterEach } from "vitest";
import { nativeCodeHash, sealNativeCookie, openNativeCookie } from "@/lib/nativeAuthCode";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }) }));
afterEach(() => vi.unstubAllEnvs());
import { POST } from "@/app/api/native/exchange/route";

// A missing/invalid code is rejected before any DB call, so these exercise the
// input guard without a database (matching the other route tests here).
function exchange(body: string) {
  return POST(
    new Request("https://keeptxt.com/api/native/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

describe("/api/native/exchange", () => {
  it("rejects a request with no code", async () => {
    const res = await exchange(JSON.stringify({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing code." });
  });

  it("rejects a non-string code", async () => {
    const res = await exchange(JSON.stringify({ code: 123 }));
    expect(res.status).toBe(400);
  });

  it("rejects an unparseable body", async () => {
    const res = await exchange("not json");
    expect(res.status).toBe(400);
  });

  it("rejects oversized bodies before database work", async () => {
    const res = await exchange(JSON.stringify({ code: "x".repeat(3000) }));
    expect(res.status).toBe(413);
  });
});

it("exchanges a bound single-use code and never stores the session cookie in plaintext", async () => {
  vi.stubEnv("AUTH_SECRET", "native-test-secret-only");
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  expect(nativeCodeHash(verifier)).toBe(challenge);
  const code = "a".repeat(43);
  const cookie_name = "__Secure-authjs.session-token";
  const cookie_value = sealNativeCookie("fixture-session", cookie_name);
  expect(cookie_value).not.toContain("fixture-session");
  let claimed = false;
  mocks.query.mockImplementation(async (sql: string, args: unknown[]) => {
    if (!sql.includes("RETURNING")) return { rows: [] };
    expect(sql).toContain("challenge = $3");
    if (claimed || args[0] !== nativeCodeHash(code) || args[2] !== challenge) return { rows: [] };
    claimed = true;
    return { rows: [{ cookie_name, cookie_value }] };
  });
  expect((await exchange(JSON.stringify({ code, verifier: "b".repeat(43) }))).status).toBe(400);
  const response = await exchange(JSON.stringify({ code, verifier }));
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("__Secure-authjs.session-token=fixture-session");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect((await exchange(JSON.stringify({ code, verifier }))).status).toBe(400);
  expect(() => openNativeCookie(cookie_value, "different-cookie")).toThrow();
});
