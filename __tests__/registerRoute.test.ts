import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  ready: vi.fn(async () => {}),
  pool: () => ({ query: mocks.query }),
  newId: () => "new-user-id",
}));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));

import { POST } from "@/app/api/auth/register/route";

// Null = address holds no account; otherwise whether the held row is verified.
let held: boolean | null = null;

function register(ip: string, email = "user@example.com") {
  // An invalid email fails validation before any DB call, so this exercises the
  // rate-limit guard without needing a database.
  return POST(
    new Request("https://keeptxt.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(
        email === "not-an-email"
          ? { email, password: "x" }
          : { email, password: "correct horse battery" },
      ),
    }),
  );
}

beforeEach(() => {
  held = null;
  mocks.query.mockReset();
  mocks.sendVerificationEmail.mockReset();
  mocks.query.mockImplementation(async (sql: string) => {
    const head = sql.trimStart().toUpperCase();
    if (head.startsWith("SELECT")) return { rows: held === null ? [] : [{ id: "u1" }] };
    if (head.startsWith("UPDATE")) return { rows: held ? [{ id: "u1" }] : [] };
    throw new Error(`unexpected query: ${sql}`);
  });
});

describe("/api/auth/register", () => {
  it("rate limits repeated attempts from the same IP", async () => {
    const ip = "203.0.113.40";
    let res = new Response(null, { status: 500 });

    for (let i = 0; i < 7; i++) {
      res = await register(ip, "not-an-email");
    }

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns success without touching the account when the email is taken", async () => {
    held = false; // verified row
    const res = await register("203.0.113.41");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // The only write allowed hits still-unverified rows, so a verified
    // account's password and token are unreachable from this endpoint.
    const writes = mocks.query.mock.calls.filter(([sql]) =>
      String(sql).trimStart().toUpperCase().startsWith("UPDATE"),
    );
    expect(writes.length).toBe(1);
    expect(String(writes[0][0])).toContain("email_verified IS NULL");
    expect(mocks.query.mock.calls.some(([sql]) =>
      String(sql).trimStart().toUpperCase().startsWith("INSERT"),
    )).toBe(false);
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("refreshes the verify link when the held account is unverified", async () => {
    held = true; // unverified row
    const res = await register("203.0.113.42");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.sendVerificationEmail).toHaveBeenCalledTimes(1);
    const [to, url] = mocks.sendVerificationEmail.mock.calls[0] as [string, string];
    expect(to).toBe("user@example.com");
    expect(url).toContain("/api/auth/verify?token=");
  });
});
