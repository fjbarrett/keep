// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), configured: vi.fn(), query: vi.fn(), cleanup: vi.fn(),
  release: vi.fn(), put: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  ready: async () => {},
  newId: () => "a".repeat(32),
  pool: () => ({
    query: mocks.cleanup,
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  }),
}));
vi.mock("@/lib/storage", () => ({
  storageConfigured: mocks.configured,
  putPrivateFile: mocks.put,
  deletePrivateFile: mocks.remove,
}));
vi.mock("@/lib/apiError", () => ({
  internalError: () => Response.json({ error: "Something went wrong" }, { status: 500 }),
}));
import { POST } from "@/app/api/upload/route";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const key = `keep/owner/${"a".repeat(32)}.png`;
function upload(type = "image/png") {
  const form = new FormData();
  form.set("file", new File([png], "pixel.png", { type }));
  return POST(new Request("https://keeptxt.com/api/upload", { method: "POST", body: form }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.configured.mockReturnValue(true);
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("sum(size)") ? [{ bytes: "0" }] : [],
  }));
  mocks.cleanup.mockResolvedValue({ rows: [] });
  mocks.put.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
});

describe("POST /api/upload", () => {
  it("requires authentication before touching storage", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await upload()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("reports an unavailable storage backend", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await upload()).status).toBe(501);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types before reserving quota", async () => {
    expect((await upload("application/octet-stream")).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("commits an owner-scoped reservation before storing the image", async () => {
    mocks.put.mockImplementation(async () => {
      expect(mocks.query).toHaveBeenCalledWith("COMMIT");
      expect(mocks.release).toHaveBeenCalledOnce();
    });
    const response = await upload();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `/api/uploads/${"a".repeat(32)}` });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO uploads"),
      ["a".repeat(32), "owner", key, "image/png", png.length, expect.any(Number)]);
    expect(mocks.put).toHaveBeenCalledWith(key, new Uint8Array(png), "image/png");
  });

  it("keeps quota enforcement after reclaiming old unreferenced images", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows:
      sql.includes("sum(size)") ? [{ bytes: String(100 * 1024 * 1024) }] :
      sql.includes("DELETE FROM uploads") ? [{ storage_key: "old-image" }] : [],
    }));
    mocks.remove.mockImplementation(async () => {
      expect(mocks.query).toHaveBeenCalledWith("COMMIT");
    });
    expect((await upload()).status).toBe(413);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO uploads"))).toBe(false);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("note_upload_references"),
      ["owner", expect.any(Number)]);
    expect(mocks.remove).toHaveBeenCalledWith("old-image");
  });

  it("rolls back a failed reservation and releases the connection", async () => {
    mocks.query.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await upload()).status).toBe(500);
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("removes the reservation and partial object when storage fails", async () => {
    mocks.put.mockRejectedValue(new Error("storage unavailable"));
    expect((await upload()).status).toBe(500);
    expect(mocks.cleanup).toHaveBeenCalledWith(expect.stringContaining("user_id = $2"),
      ["a".repeat(32), "owner"]);
    expect(mocks.remove).toHaveBeenCalledWith(key);
  });
});
