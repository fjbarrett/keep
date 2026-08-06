import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
  getPrivateFile: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  ready: vi.fn(async () => {}),
  pool: () => ({ query: mocks.query }),
}));
vi.mock("@/lib/storage", () => ({
  getPrivateFile: mocks.getPrivateFile,
  deletePrivateFile: vi.fn(),
}));

import { GET } from "@/app/api/uploads/[id]/route";

const id = "a".repeat(32);
const shareToken = "public-share-token";
const upload = {
  storage_key: `keep/owner/${id}.png`,
  content_type: "image/png",
};

function request(query = "") {
  return GET(
    new Request(`https://keeptxt.com/api/uploads/${id}${query}`),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.query.mockReset();
  mocks.getPrivateFile.mockReset();
  // The route asks Postgres for a row the caller is entitled to rather than
  // fetching one and deciding afterwards, so the fake pool stands in for that
  // predicate: a row comes back only when the bound owner id or share token
  // would have satisfied it.
  mocks.query.mockImplementation(async (_sql: string, params: unknown[]) => {
    const [rowId, ownerId, share, reference] = params as
      [string, string | null, string | null, string];
    const entitled =
      ownerId === "owner" || (share === shareToken && reference === `/api/uploads/${id}`);
    return { rows: rowId === id && entitled ? [upload] : [] };
  });
  mocks.getPrivateFile.mockResolvedValue({
    body: new Uint8Array([1, 2, 3]).buffer,
    contentType: "image/png",
  });
});

describe("GET /api/uploads/:id", () => {
  it("serves a private upload to its owner", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.getPrivateFile).toHaveBeenCalledWith(upload.storage_key);
  });

  it("constrains the lookup on the caller rather than on the id alone", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" } });
    await request();
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toMatch(/u\.user_id = \$2/);
    expect(sql).toMatch(/n\.share_token = \$3/);
    expect(params).toEqual([id, "owner", null, `/api/uploads/${id}`]);
  });

  it("hides an upload from an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.getPrivateFile).not.toHaveBeenCalled();
  });

  it("hides an upload from a signed-in non-owner", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "someone-else" } });
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.getPrivateFile).not.toHaveBeenCalled();
  });

  it("serves only uploads referenced by the shared note", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await request(`?share=${shareToken}`);
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("rejects a share token that does not open this upload", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await request("?share=some-other-token");
    expect(response.status).toBe(404);
    expect(mocks.getPrivateFile).not.toHaveBeenCalled();
  });
});
