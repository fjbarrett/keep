import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotes } from "@/lib/useNotes";
import { addPendingOp, cacheNotes, getCachedNotes, getPendingOps } from "@/lib/offlineDb";
import { readNoteDrafts, writeNoteDraft } from "@/lib/noteDrafts";
import type { Note } from "@/lib/types";
const note: Note = { id: "a".repeat(32), title: "Test", body: "Old server body", pinned: false,
  archived: false, trashed: false, markdown: false, highlight: false, tags: [],
  shareToken: null, createdAt: 1, updatedAt: 1 };
const json = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("overlays queued edits over refresh in both visible and cached notes", async () => {
  const owner = crypto.randomUUID();
  await cacheNotes(owner, [note]);
  await addPendingOp(owner, { type: "update", noteId: note.id, payload: { body: "Offline text" } });
  vi.stubGlobal("fetch", vi.fn((_path, init) => init?.method === "PATCH"
    ? json({ error: "Rate limited" }, 429) : json({ notes: [note] })));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.notes[0].body).toBe("Offline text");
  expect((await getCachedNotes(owner))[0].body).toBe("Offline text");
  expect(await getPendingOps(owner)).toHaveLength(1);
});

it("preserves rejected legacy body operations as recoverable drafts", async () => {
  const owner = crypto.randomUUID();
  await cacheNotes(owner, [note]);
  await addPendingOp(owner, { type: "update", noteId: note.id, payload: { body: "Do not lose this" } });
  vi.stubGlobal("fetch", vi.fn((_path, init) => init?.method === "PATCH"
    ? json({ error: "Gone" }, 404) : json({ notes: [] })));
  renderHook(() => useNotes(owner));
  await waitFor(() => expect(readNoteDrafts(owner)[0]?.note.body).toBe("Do not lose this"));
  await waitFor(async () => expect(await getPendingOps(owner)).toEqual([]));
});

it("allocates ordered stamps across independent tab module instances", async () => {
  const owner = crypto.randomUUID();
  vi.spyOn(Date, "now").mockReturnValue(100);
  const first = await addPendingOp(owner, { type: "create", noteId: note.id, payload: note });
  vi.resetModules();
  const otherTab = await import("@/lib/offlineDb");
  const later = await Promise.all(Array.from({ length: 8 }, (_, n) => otherTab.addPendingOp(owner,
    { type: "update", noteId: note.id, payload: { body: String(n) } })));
  expect(new Set([first, ...later].map((op) => op.createdAt)).size).toBe(9);
  expect(later.every((op) => op.createdAt > first.createdAt)).toBe(true);
});

it("does not confuse an owner's journal with a longer owner prefix", () => {
  writeNoteDraft("a.b", { note, patch: { body: note.body }, type: "update" });
  expect(readNoteDrafts("a")).toEqual([]);
  expect(readNoteDrafts("a.b")).toHaveLength(1);
});
