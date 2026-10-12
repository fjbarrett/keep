// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  ready: async () => {},
  pool: () => ({ query: mocks.query }),
}));

import { POST } from "@/app/api/notes/import/route";

function upload(name: string, content: string, ip = "203.0.113.40") {
  const form = new FormData();
  form.set("file", new File([content], name));
  return POST(
    new Request("https://keeptxt.com/api/notes/import", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: form,
    }),
  );
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "owner" } });
  mocks.query.mockReset();
});

describe("POST /api/notes/import", () => {
  it("rejects malformed standalone JSON as not a Keep export", async () => {
    const res = await upload("note.json", "{not json");
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "That file isn't a Google Keep export.",
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a file that is not a zip the same way", async () => {
    const res = await upload("Takeout.zip", "not a zip");
    expect(res.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rate limits repeated imports from one IP", async () => {
    const ip = "203.0.113.41";
    let res = new Response(null, { status: 500 });
    for (let i = 0; i < 6; i++) res = await upload("note.json", "{not json", ip);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
