// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), remove: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }), rowToNote: (note: unknown) => note }));
vi.mock("@/lib/storage", () => ({ deletePrivateFile: mocks.remove }));
import { DELETE } from "@/app/api/notes/[id]/route";
const removeNote = () => DELETE(new Request("https://keep.test/api/notes/note"), { params: Promise.resolve({ id: "note" }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.remove.mockResolvedValue(undefined);
});
it("deletes only owner-scoped rows and unreferenced attachments", async () => {
  const upload = "a".repeat(32);
  mocks.query.mockResolvedValueOnce({ rows: [{ body: `/api/uploads/${upload}` }] })
    .mockResolvedValueOnce({ rows: [{ storage_key: "private-object" }] });
  expect((await removeNote()).status).toBe(200);
  expect(mocks.query.mock.calls[0][0]).toContain("user_id = $2");
  expect(mocks.query.mock.calls[0][1]).toEqual(["note", "owner"]);
  expect(mocks.query.mock.calls[1][0]).toContain("note_upload_references");
  expect(mocks.query.mock.calls[1][1]).toEqual([[upload], "owner"]);
  expect(mocks.remove).toHaveBeenCalledWith("private-object");
});
it("accepts an already absent note without deleting any objects", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  expect((await removeNote()).status).toBe(200);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("requires authentication before querying", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await removeNote()).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
