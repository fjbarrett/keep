import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  ready: async () => {}, pool: () => ({ query: mocks.query }), rowToNote: (n: unknown) => n,
}));
vi.mock("@/lib/storage", () => ({ deletePrivateFile: vi.fn() }));
import { PATCH } from "@/app/api/notes/[id]/route";

const id = "a".repeat(32);
const patch = (body: unknown) => PATCH(new Request("https://keeptxt.com/api/notes/" + id, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.query.mockReset();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
});

it("atomically checks the saved version and advances it even within one millisecond", async () => {
  mocks.query.mockResolvedValue({ rows: [{ id, body: "Latest", updatedAt: 11 }] });
  const response = await patch({ body: "Latest", expectedUpdatedAt: 10 });
  expect(response.status).toBe(200);
  const [sql, values] = mocks.query.mock.calls[0];
  expect(sql).toContain("GREATEST(updated_at + 1,");
  expect(sql).toMatch(/AND updated_at = \$\d+/);
  expect(values.at(-1)).toBe(10);
  expect(values).toContain("owner");
});

it("returns the owner's newer version without overwriting it", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
    rows: [{ id, body: "Newer device text", updatedAt: 12 }],
  });
  const response = await patch({ body: "Old text", expectedUpdatedAt: 10 });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ note: { body: "Newer device text" } });
  expect(mocks.query.mock.calls[1][1]).toEqual([id, "owner"]);
});

it("does not reveal a conflicting note belonging to another account", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  expect((await patch({ body: "Text", expectedUpdatedAt: 10 })).status).toBe(404);
});

it.each([-1, 1.5, "1", null])("rejects invalid version %s", async (expectedUpdatedAt) => {
  expect((await patch({ body: "Text", expectedUpdatedAt })).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
