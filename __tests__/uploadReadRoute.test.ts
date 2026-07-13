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
const upload = {
  user_id: "owner",
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
  mocks.query.mockResolvedValueOnce({ rows: [upload] });
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

  it("hides an upload from an unauthenticated caller", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await request();
    expect(response.status).toBe(404);
    expect(mocks.getPrivateFile).not.toHaveBeenCalled();
  });

  it("serves only uploads referenced by the shared note", async () => {
    mocks.auth.mockResolvedValue(null);
    mocks.query.mockResolvedValueOnce({ rows: [{ allowed: 1 }] });
    const response = await request("?share=public-share-token");
    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});
