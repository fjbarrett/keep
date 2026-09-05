import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotes } from "@/lib/useNotes";
import { readNoteDrafts, writeNoteDraft, removeNoteDraft } from "@/lib/noteDrafts";
import { clearOwnerData } from "@/lib/offlineDb";
import type { Note } from "@/lib/types";

const note: Note = { id: "a".repeat(32), title: "Title", body: "Title\noriginal", pinned: false,
  archived: false, trashed: false, markdown: false, highlight: false, tags: [],
  shareToken: null, createdAt: 1, updatedAt: 1 };
const json = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("retains a rejected edit through refresh and remount, then retries it", async () => {
  const owner = crypto.randomUUID();
  let reject = true;
  let saved = note;
  vi.stubGlobal("fetch", vi.fn((path, init) => {
    if (!init?.method || init.method === "GET") return json({ notes: [saved] });
    if (reject) return json({ error: "Too large" }, 413);
    saved = { ...saved, ...JSON.parse(init.body), updatedAt: 2 };
    return json({ note: saved });
  }));
  const first = renderHook(() => useNotes(owner));
  await waitFor(() => expect(first.result.current.hydrated).toBe(true));
  await act(async () => { await first.result.current.update(note.id, { body: "Title\nmy draft" }); });
  await act(async () => { await first.result.current.refresh(); });
  expect(first.result.current.notes[0].body).toBe("Title\nmy draft");
  expect(first.result.current.error).toBeTruthy();
  first.unmount();
  const second = renderHook(() => useNotes(owner));
  await waitFor(() => expect(second.result.current.notes[0]?.body).toBe("Title\nmy draft"));
  reject = false;
  await act(async () => { await second.result.current.retryDrafts(); });
  expect(saved.body).toBe("Title\nmy draft");
  expect(readNoteDrafts(owner)).toEqual([]);
  expect(second.result.current.error).toBeNull();
});

it("retains and retries a rejected create with the original client identity", async () => {
  const owner = crypto.randomUUID();
  let reject = true;
  const ids: string[] = [];
  let saved: Note | null = null;
  vi.stubGlobal("fetch", vi.fn((_path, init) => {
    if (_path === "/api/notes/title") return json({ title: "Unsynced new note" });
    if (init?.method !== "POST") return json({ notes: saved ? [saved] : [] });
    const payload = JSON.parse(init.body); ids.push(payload.id);
    expect(payload.ownerId).toBe(owner);
    if (reject) return json({ error: "Session expired" }, 401);
    saved = payload;
    return json({ note: saved });
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => { await result.current.create({ body: "Unsynced new note" }); });
  expect(result.current.notes[0].body).toBe("Unsynced new note");
  reject = false;
  await act(async () => { await result.current.retryDrafts(); });
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(readNoteDrafts(owner)).toEqual([]);
});

it("keeps newer journal text when an older acknowledgement arrives and isolates owners", async () => {
  const owner = crypto.randomUUID();
  const old = writeNoteDraft(owner, { note, patch: { body: note.body }, type: "update" });
  writeNoteDraft(owner, { note: { ...note, body: "newer" }, patch: { body: "newer" }, type: "update" });
  removeNoteDraft(owner, old);
  expect(readNoteDrafts(owner)[0].note.body).toBe("newer");
  expect(readNoteDrafts("another-owner")).toEqual([]);
  await clearOwnerData(owner);
  expect(readNoteDrafts(owner)).toEqual([]);
});
