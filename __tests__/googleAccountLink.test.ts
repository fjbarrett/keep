import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = { id: string; email: string | null; email_verified: string | null };

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));

vi.mock("@/lib/db", () => ({
  ready: vi.fn(async () => {}),
  pool: () => ({
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  }),
}));

import { linkGoogleAccount } from "@/lib/googleAccountLink";

const GOOGLE_SUB = "104857392017465920371";
let users: UserRow[] = [];

// Stands in for the transaction: only the SELECT needs to answer from data, and
// it answers with the same predicate Postgres would apply.
function fakePool(sql: string, params: unknown[] = []) {
  if (/^\s*SELECT id, email_verified FROM users/.test(sql)) {
    const [id, email] = params as [string, string | null];
    const rows = users.filter(
      (u) =>
        u.id === id ||
        (email !== null && u.email !== null && u.email.toLowerCase() === email.toLowerCase()),
    );
    return { rows: rows.map(({ id: rowId, email_verified }) => ({ id: rowId, email_verified })) };
  }
  return { rows: [] };
}

const statements = () => mocks.query.mock.calls.map(([sql]) => sql as string);
const find = (pattern: RegExp) => statements().find((sql) => pattern.test(sql));

function link(email: string | null, emailVerified = true) {
  return linkGoogleAccount({
    id: GOOGLE_SUB,
    email,
    emailVerified,
    name: "Ada",
    now: 1_700_000_000_000,
  });
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.release.mockReset();
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => fakePool(sql, params));
  users = [];
});

describe("linkGoogleAccount", () => {
  it("inserts a fresh row when nothing holds the address", async () => {
    await expect(link("ada@example.com")).resolves.toEqual({ linked: false });
    expect(find(/INSERT INTO users/)).toBeTruthy();
    expect(find(/UPDATE users/)).toBeUndefined();
  });

  it("adopts a squatted row rather than raising 23505 beside it", async () => {
    users = [{ id: "squatter", email: "ada@example.com", email_verified: null }];

    await expect(link("ada@example.com")).resolves.toEqual({
      linked: true,
      adoptedFrom: "squatter",
      wasVerified: false,
    });
    expect(find(/UPDATE users/)).toBeTruthy();
    expect(find(/INSERT INTO users/)).toBeUndefined();
  });

  it("carries the adopted row's notes and uploads to the Google sub", async () => {
    users = [{ id: "squatter", email: "ada@example.com", email_verified: null }];
    await link("ada@example.com");

    for (const table of ["notes", "uploads"]) {
      const call = mocks.query.mock.calls.find(([sql]) =>
        new RegExp(`UPDATE ${table} SET user_id`).test(sql as string),
      );
      expect(call?.[1]).toEqual([GOOGLE_SUB, "squatter"]);
    }
  });

  // The takeover this guards: /api/auth/register stores a password_hash before
  // anyone answers the verification mail, so a stranger can seed a row for an
  // address they don't own. email_verified only says the real owner later clicked
  // that (genuine) link. Keeping the hash past adoption would leave the stranger
  // with a working password on the victim's Google account.
  it("drops the squatter's password even when the row was verified", async () => {
    users = [{ id: "squatter", email: "ada@example.com", email_verified: "1699999999999" }];

    const outcome = await link("ada@example.com");
    expect(outcome).toEqual({ linked: true, adoptedFrom: "squatter", wasVerified: true });

    const update = find(/UPDATE users/) ?? "";
    expect(update).toMatch(/password_hash = NULL/);
    expect(update).toMatch(/verify_token = NULL/);
    expect(update).toMatch(/verify_token_expires = NULL/);
    // Nothing may make the clearing conditional on email_verified again.
    expect(update).not.toMatch(/CASE/i);
    expect(update).not.toMatch(/email_verified/);
  });

  it("ignores an address Google has not verified", async () => {
    users = [{ id: "squatter", email: "ada@example.com", email_verified: null }];

    await expect(link("ada@example.com", false)).resolves.toEqual({ linked: false });
    expect(find(/UPDATE users/)).toBeUndefined();
    const insert = mocks.query.mock.calls.find(([sql]) => /INSERT INTO users/.test(sql as string));
    expect(insert?.[1]).toEqual([GOOGLE_SUB, null, "Ada", 1_700_000_000_000]);
  });

  it("keeps a stored address when Google returns none", async () => {
    users = [{ id: GOOGLE_SUB, email: "ada@example.com", email_verified: "1699999999999" }];

    await link(null);
    expect(find(/INSERT INTO users/)).toMatch(/COALESCE\(EXCLUDED\.email, users\.email\)/);
  });

  it("updates its own row in place instead of adopting a second one", async () => {
    users = [
      { id: GOOGLE_SUB, email: "ada@example.com", email_verified: null },
      { id: "other", email: "ada@example.com", email_verified: null },
    ];

    await expect(link("ada@example.com")).resolves.toEqual({ linked: false });
    expect(find(/UPDATE users/)).toBeUndefined();
  });

  it("rolls back and releases the client when a statement fails", async () => {
    users = [{ id: "squatter", email: "ada@example.com", email_verified: null }];
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/UPDATE notes/.test(sql)) throw new Error("boom");
      return fakePool(sql, params);
    });

    await expect(link("ada@example.com")).rejects.toThrow("boom");
    expect(statements()).toContain("ROLLBACK");
    expect(statements()).not.toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalled();
  });
});
