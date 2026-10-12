import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { logger } from "@/lib/logger";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  ready: vi.fn(),
  config: null as NextAuthConfig | null,
}));

// Capture the config auth.ts hands to NextAuth so its real callbacks run here,
// without the request plumbing NextAuth wraps around them.
vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("@/lib/db", () => ({ ready: mocks.ready, pool: () => ({ query: mocks.query }) }));

import "@/auth";

type JwtParams = Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0];

// A session read: @auth/core calls jwt() with only the decoded token.
function readSession(token: JWT) {
  return mocks.config!.callbacks!.jwt!({ token } as JwtParams);
}

const stored = (session_version: number) => ({ rows: [{ session_version }] });

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.ready.mockReset().mockResolvedValue(undefined);
  mocks.query.mockReset();
});

describe("jwt callback on session reads", () => {
  it("keeps the session when the version query fails", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    mocks.query.mockRejectedValue(new Error("connection terminated unexpectedly"));

    await expect(readSession({ sub: "user-1", sessionVersion: 2 })).resolves.toEqual({
      sub: "user-1",
      sessionVersion: 2,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the database is still coming up", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    mocks.ready.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(readSession({ sub: "user-1", sessionVersion: 2 })).resolves.toEqual({
      sub: "user-1",
      sessionVersion: 2,
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("ends the session when its version is stale", async () => {
    mocks.query.mockResolvedValue(stored(3));
    await expect(readSession({ sub: "user-1", sessionVersion: 2 })).resolves.toBeNull();
  });

  it("ends a session that carries no version claim", async () => {
    mocks.query.mockResolvedValue(stored(0));
    await expect(readSession({ sub: "user-1" })).resolves.toBeNull();
  });

  it("ends the session when the user row is gone", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(readSession({ sub: "user-1", sessionVersion: 2 })).resolves.toBeNull();
  });

  it("keeps a session whose version matches", async () => {
    mocks.query.mockResolvedValue(stored(2));
    await expect(readSession({ sub: "user-1", sessionVersion: 2 })).resolves.toEqual({
      sub: "user-1",
      sessionVersion: 2,
    });
    expect(mocks.query.mock.calls[0][1]).toEqual(["user-1"]);
  });
});

describe("jwt callback at sign-in", () => {
  it("pins the Google sub and the current version onto a new token", async () => {
    mocks.query.mockResolvedValue(stored(5));
    const token = await mocks.config!.callbacks!.jwt!({
      token: { sub: "random-uuid" },
      user: { id: "random-uuid" },
      account: { provider: "google", providerAccountId: "104857392017465920371", type: "oidc" },
    } as JwtParams);
    expect(token).toEqual({ sub: "104857392017465920371", sessionVersion: 5 });
  });
});
