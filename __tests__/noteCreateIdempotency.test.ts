import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "owner" } })),
}));

vi.mock("@/lib/db", () => ({
  newId: vi.fn(() => "f".repeat(32)),
  ready: vi.fn(async () => {}),
  pool: () => ({ query: mocks.query }),
  rowToNote: (row: unknown) => row,
}));

import { POST } from "@/app/api/notes/route";

const id = "0123456789abcdef0123456789abcdef";
const row = {
  id,
  title: "Queued note",
  summary: null,
  color: null,
  body: "body",
  pinned: false,
  archived: false,
  trashed: false,
  markdown: false,
  highlight: false,
  tags: [],
  share_token: null,
  created_at: "1",
  updated_at: "1",
};

beforeEach(() => {
  mocks.query.mockReset();
});

describe("POST /api/notes idempotency", () => {
  it("returns an existing owned note when an offline create is replayed", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });

    const response = await POST(
      new Request("https://keeptxt.com/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, title: row.title, body: row.body }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ note: row });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});
