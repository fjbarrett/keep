import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotes } from "@/lib/useNotes";
import { getPendingOps } from "@/lib/offlineDb";
import { readNoteDrafts } from "@/lib/noteDrafts";
import type { Note } from "@/lib/types";
const initial: Note = { id: "a".repeat(32), title: "Heading", body: "Heading\nOriginal", pinned: false,
  archived: false, trashed: false, markdown: false, highlight: false, tags: [],
  shareToken: null, createdAt: 1, updatedAt: 1 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it("persists a new note before optional title generation returns", async () => {
  const owner = crypto.randomUUID();
  let server: Note | undefined;
  let finishTitle!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn((path, init) => {
    if (path === "/api/notes/title") return new Promise<Response>((resolve) => { finishTitle = resolve; });
    if (init?.method === "POST") {
      server = { ...initial, ...JSON.parse(init.body), updatedAt: 2 };
      return Promise.resolve(json({ note: server }));
    }
    if (init?.method === "PATCH") {
      server = { ...server!, ...JSON.parse(init.body), updatedAt: 3 };
      return Promise.resolve(json({ note: server }));
    }
    return Promise.resolve(json({ notes: server ? [server] : [] }));
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => { await result.current.create({ body: "A durable note" }); });
  expect(server?.body).toBe("A durable note");
  expect(finishTitle).toBeDefined();
  await act(async () => { finishTitle(json({ title: "Generated title", summary: "Summary" })); });
  await waitFor(() => expect(server?.title).toBe("Generated title"));
});

it("recomputes metadata when typing supersedes a pending title request", async () => {
  const owner = crypto.randomUUID();
  let server = initial;
  const titles: Array<(value: Response) => void> = [];
  vi.stubGlobal("fetch", vi.fn((path, init) => {
    if (path === "/api/notes/title") return new Promise<Response>((resolve) => titles.push(resolve));
    if (init?.method === "PATCH") {
      server = { ...server, ...JSON.parse(init.body), updatedAt: server.updatedAt + 1 };
      return Promise.resolve(json({ note: server }));
    }
    return Promise.resolve(json({ notes: [server] }));
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  let first!: Promise<void>, second!: Promise<void>;
  act(() => { first = result.current.update(initial.id, { body: "New heading\nFirst" }); });
  await waitFor(() => expect(titles).toHaveLength(1));
  act(() => { second = result.current.update(initial.id, { body: "New heading\nLatest" }); });
  await act(async () => { titles[0](json({ title: "New title" })); await first; });
  await waitFor(() => expect(titles).toHaveLength(2));
  await act(async () => { titles[1](json({ title: "New title" })); await second; });
  expect(server).toMatchObject({ title: "New title", body: "New heading\nLatest" });
});

it.each([true, false])("integrated save keeps latest text when exit request completes first: %s", async (latestFirst) => {
  const owner = crypto.randomUUID();
  let server = initial;
  const replies: Array<() => void> = [];
  vi.stubGlobal("fetch", vi.fn((_path, init) => {
    if (init?.method !== "PATCH") return Promise.resolve(json({ notes: [server] }));
    const patch = JSON.parse(init.body);
    return new Promise<Response>((resolve) => {
      const finish = () => {
        if (server.updatedAt !== patch.expectedUpdatedAt) resolve(json({ note: server }, 409));
        else { server = { ...server, ...patch, updatedAt: server.updatedAt + 1 }; resolve(json({ note: server })); }
      };
      replies.push(finish);
      if (replies.length > 2) finish();
    });
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  let old!: Promise<void>, latest!: Promise<void>;
  act(() => { old = result.current.update(initial.id, { body: "Heading\nOlder" }); });
  await waitFor(() => expect(replies).toHaveLength(1));
  act(() => { latest = result.current.update(initial.id, { body: "Heading\nLatest" }, { keepalive: true }); });
  await waitFor(() => expect(replies).toHaveLength(2));
  await act(async () => { replies[latestFirst ? 1 : 0](); replies[latestFirst ? 0 : 1](); await Promise.all([old, latest]); });
  expect(server.body).toBe("Heading\nLatest");
  expect(result.current.notes[0].body).toBe("Heading\nLatest");
  expect(readNoteDrafts(owner)).toEqual([]);
  expect(result.current.error).toBeNull();
});

it("replays only the latest durable body when multiple older operations are queued", async () => {
  const owner = crypto.randomUUID();
  let server = initial;
  let offline = true;
  vi.stubGlobal("fetch", vi.fn((_path, init) => {
    if (init?.method !== "PATCH") return Promise.resolve(json({ notes: [server] }));
    if (offline) return Promise.resolve(json({ error: "Offline" }, 503));
    const patch = JSON.parse(init.body);
    if (patch.expectedUpdatedAt !== server.updatedAt) return Promise.resolve(json({ note: server }, 409));
    server = { ...server, ...patch, updatedAt: server.updatedAt + 1 };
    return Promise.resolve(json({ note: server }));
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => { await result.current.update(initial.id, { body: "Heading\nFirst" }); });
  await act(async () => { await result.current.update(initial.id, { body: "Heading\nLatest" }); });
  await waitFor(async () => expect((await getPendingOps(owner)).length).toBeGreaterThan(0));
  offline = false;
  await act(async () => { window.dispatchEvent(new Event("online")); });
  await waitFor(async () => expect(await getPendingOps(owner)).toEqual([]));
  expect(server.body).toBe("Heading\nLatest");
  expect(readNoteDrafts(owner)).toEqual([]);
});
