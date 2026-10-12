import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig, User } from "next-auth";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  verify: vi.fn(),
  decoy: "scrypt$32768$8$3$ZGVjb3ktc2FsdC1kZWNveQ==$ZGVjb3k=",
  config: null as NextAuthConfig | null,
}));

vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }) }));
vi.mock("@/lib/password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/password")>()),
  verifyPassword: mocks.verify,
  decoyPasswordHash: async () => mocks.decoy,
}));
vi.mock("@/lib/audit", () => ({ recordSecurityEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/loginThrottle", () => ({ checkLoginThrottle: () => ({ allowed: true }) }));

import "@/auth";

type PasswordProvider = {
  id?: string;
  authorize: (credentials: Record<string, unknown>, request: Request) => Promise<User | null>;
};

const STORED_HASH = "scrypt$32768$8$3$c3RvcmVkLXNhbHQtc3RvcmVk$c3RvcmVk";
const PASSWORD = "correct horse battery staple";

function authorize(email = "ada@example.com", password = PASSWORD) {
  const provider = (mocks.config!.providers as Array<{ options?: PasswordProvider }>).find(
    (p) => p.options?.id === "password",
  )!.options!;
  return provider.authorize(
    { email, password },
    new Request("https://keeptxt.com/api/auth/callback/password", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    }),
  );
}

const account = (overrides: Record<string, unknown> = {}) => ({
  rows: [
    {
      id: "user-1",
      email: "ada@example.com",
      name: "Ada",
      password_hash: STORED_HASH,
      email_verified: "1700000000000",
      session_version: 4,
      ...overrides,
    },
  ],
});

beforeEach(() => {
  mocks.query.mockReset();
  mocks.verify.mockReset();
});

describe("password authorize", () => {
  it("pays the same hashing cost for an unknown address and still fails", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.verify.mockResolvedValue(true);

    await expect(authorize("nobody@example.com")).resolves.toBeNull();
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith(PASSWORD, mocks.decoy);
  });

  it("pays the same hashing cost for an account without a password", async () => {
    mocks.query.mockResolvedValue(account({ password_hash: null }));
    mocks.verify.mockResolvedValue(true);

    await expect(authorize()).resolves.toBeNull();
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith(PASSWORD, mocks.decoy);
  });

  it("checks a stored password exactly once", async () => {
    mocks.query.mockResolvedValue(account());
    mocks.verify.mockResolvedValue(false);

    await expect(authorize()).resolves.toBeNull();
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith(PASSWORD, STORED_HASH);
  });

  it("fails an unverified account only after the same password check", async () => {
    mocks.query.mockResolvedValue(account({ email_verified: null }));
    mocks.verify.mockResolvedValue(true);

    await expect(authorize()).resolves.toBeNull();
    expect(mocks.verify).toHaveBeenCalledTimes(1);
  });

  it("signs in a verified account", async () => {
    mocks.query.mockResolvedValue(account());
    mocks.verify.mockResolvedValue(true);

    await expect(authorize("Ada@Example.com")).resolves.toEqual({
      id: "user-1",
      email: "ada@example.com",
      name: "Ada",
      sessionVersion: 4,
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][1]).toEqual(["ada@example.com"]);
  });
});
