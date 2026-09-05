import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotes } from "@/lib/useNotes";
import { readNoteDrafts, writeNoteDraft } from "@/lib/noteDrafts";
import { addPendingOp, getPendingOps } from "@/lib/offlineDb";
import type { Note } from "@/lib/types";
const note: Note = { id: "a".repeat(32), title: "Test", body: "body", pinned: false,
  archived: false, trashed: true, markdown: false, highlight: false, tags: [],
  shareToken: null, createdAt: 1, updatedAt: 1 };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("retires a rejected draft when permanently deleted", async () => {
  const owner = crypto.randomUUID();
  let deleted = false;
  writeNoteDraft(owner, { note: { ...note, body: "rejected" }, patch: { body: "rejected" }, type: "update", base: note });
  vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => {
    if (init?.method === "DELETE") { deleted = true; return Response.json({ ok: true }); }
    return Response.json({ notes: deleted ? [] : [note] });
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => { await result.current.remove(note.id); await result.current.refresh(); });
  expect(deleted).toBe(true);
  expect(readNoteDrafts(owner)).toHaveLength(0);
  expect(result.current.notes).toHaveLength(0);
  expect(await getPendingOps(owner)).toHaveLength(0);
});

it("replays a deletion past an unsavable create and accepts already-deleted notes", async () => {
  const owner = crypto.randomUUID();
  writeNoteDraft(owner, { note, patch: note, type: "create" });
  await addPendingOp(owner, { noteId: note.id, type: "create", payload: note });
  await addPendingOp(owner, { noteId: note.id, type: "delete" });
  const methods: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "DELETE") return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ notes: [] });
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(async () => expect(await getPendingOps(owner)).toHaveLength(0));
  expect(methods).toContain("DELETE");
  expect(methods).not.toContain("POST");
  expect(readNoteDrafts(owner)).toHaveLength(0);
  expect(result.current.notes).toHaveLength(0);
});

it("waits for a pending create before deleting and ignores its late acknowledgement", async () => {
  const owner = crypto.randomUUID();
  let finish!: (response: Response) => void;
  let server: Note | undefined;
  const methods: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      server = { ...note, ...payload };
      return new Promise<Response>((resolve) => { finish = resolve; });
    }
    if (init?.method === "DELETE") { server = undefined; return Response.json({ ok: true }); }
    return Response.json({ notes: server ? [server] : [] });
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  let creation!: Promise<Note | null>;
  act(() => { creation = result.current.create({ body: "body", title: "Test" }); });
  await waitFor(() => expect(finish).toBeDefined());
  const created = server!;
  let deletion!: Promise<void>;
  act(() => { deletion = result.current.remove(created.id); });
  await waitFor(async () => expect((await getPendingOps(owner)).some((op) => op.type === "delete")).toBe(true));
  expect(methods).not.toContain("DELETE");
  await act(async () => { finish(Response.json({ note: created })); await creation; await deletion; });
  expect(methods).toContain("DELETE");
  expect(server).toBeUndefined();
  expect(result.current.notes).toHaveLength(0);
  expect(readNoteDrafts(owner)).toHaveLength(0);
});
