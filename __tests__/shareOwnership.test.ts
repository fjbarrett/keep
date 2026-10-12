// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ ready: async () => {}, pool: () => ({ query: mocks.query }), rowToNote: (row: unknown) => row }));
vi.mock("@/lib/audit", () => ({ recordSecurityEvent: vi.fn() }));
import { PUT } from "@/app/api/notes/[id]/share/route";

const request = () => new Request("https://keeptxt.com/api/notes/note/share", {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: "my-public-note-link" }),
});
beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.query.mockReset();
});

it("checks ownership in the write before considering a link collision", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  const response = await PUT(request(), { params: Promise.resolve({ id: "note" }) });
  expect(response.status).toBe(404);
  expect(mocks.query).toHaveBeenCalledOnce();
  expect(mocks.query.mock.calls[0][0]).toMatch(/UPDATE notes[\s\S]*WHERE id = \$3 AND user_id = \$4/);
  expect(mocks.query.mock.calls[0][1].slice(2)).toEqual(["note", "owner"]);
});

it("reports a database uniqueness collision as a useful validation error", async () => {
  mocks.query.mockRejectedValue({ code: "23505" });
  const response = await PUT(request(), { params: Promise.resolve({ id: "note" }) });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "That link is already taken." });
});
