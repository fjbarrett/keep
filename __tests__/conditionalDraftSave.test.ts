import { afterEach, expect, it, vi } from "vitest";
import { saveNoteDraft } from "@/lib/saveNoteDraft";
import { readNoteDrafts, writeNoteDraft } from "@/lib/noteDrafts";
import type { Note } from "@/lib/types";
const note: Note = { id: "a".repeat(32), title: "Title", body: "Original", pinned: false,
  archived: false, trashed: false, markdown: false, highlight: false, tags: [],
  shareToken: null, createdAt: 1, updatedAt: 1 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it.each([true, false])("keeps the latest body when lifecycle request completes first: %s", async (latestFirst) => {
  let server = note;
  const requests: Array<() => void> = [];
  vi.stubGlobal("fetch", vi.fn((_path, init) => new Promise<Response>((resolve) => {
    const patch = JSON.parse(init.body);
    const finish = () => {
      if (patch.expectedUpdatedAt !== server.updatedAt) resolve(json({ note: server }, 409));
      else { server = { ...server, ...patch, updatedAt: server.updatedAt + 1 }; resolve(json({ note: server })); }
    };
    requests.push(finish);
    if (requests.length > 2) finish();
  })));
  const old = writeNoteDraft("A", { note: { ...note, body: "Older" }, patch: { body: "Older" }, type: "update", base: note });
  const first = saveNoteDraft("A", old).catch((error) => error);
  const latest = writeNoteDraft("A", { note: { ...note, body: "Latest" }, patch: { body: "Latest" },
    type: "update", base: note, predecessors: ["Older"] });
  const second = saveNoteDraft("A", latest, { keepalive: true });
  requests[latestFirst ? 1 : 0]();
  requests[latestFirst ? 0 : 1]();
  await Promise.all([first, second]);
  expect(server.body).toBe("Latest");
  expect(readNoteDrafts("A")).toEqual([]);
});

it("preserves a conflicting draft across restart instead of overwriting another device", async () => {
  const remote = { ...note, body: "Other device", updatedAt: 2 };
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json({ note: remote }, 409))));
  writeNoteDraft("A", { note: { ...note, body: "My text" }, patch: { body: "My text" }, type: "update", base: note });
  await expect(saveNoteDraft("A", readNoteDrafts("A")[0])).rejects.toMatchObject({ status: 409 });
  expect(readNoteDrafts("A")[0].note.body).toBe("My text");
});

it("recognizes a lost acknowledgement without creating another note", async () => {
  const saved = { ...note, body: "Saved text", updatedAt: 2 };
  const fetcher = vi.fn(() => Promise.resolve(json({ note: saved }, 409)));
  vi.stubGlobal("fetch", fetcher);
  const draft = writeNoteDraft("A", { note: saved, patch: { body: saved.body }, type: "update", base: note });
  await expect(saveNoteDraft("A", draft)).resolves.toEqual(saved);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(readNoteDrafts("A")).toEqual([]);
});
