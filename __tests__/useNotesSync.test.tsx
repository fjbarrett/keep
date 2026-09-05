import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPendingOp, getPendingOps } from "@/lib/offlineDb";
import type { Note } from "@/lib/types";
import { useNotes } from "@/lib/useNotes";

const NOTE_ID = "0123456789abcdef0123456789abcdef";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
    title: "Test",
    summary: null,
    color: null,
    body: "body",
    pinned: false,
    archived: false,
    trashed: false,
    markdown: false,
    highlight: false,
    tags: [],
    shareToken: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useNotes synchronization", () => {
  it("uses keepalive and local title inference for lifecycle saves", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/notes") return Promise.resolve(json({ notes: [note()] }));
      if (path === `/api/notes/${NOTE_ID}`) {
        expect(init?.keepalive).toBe(true);
        const patch = JSON.parse(String(init?.body));
        expect(patch).toMatchObject({ body: "Local title\nbody", title: "Local title" });
        return Promise.resolve(json({ note: note(patch) }));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useNotes(owner));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => {
      await result.current.update(
        NOTE_ID,
        { body: "Local title\nbody" },
        { keepalive: true },
      );
    });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      "/api/notes/title",
    );
  });

  it("starts a lifecycle save while an older save is still in flight", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    let finishFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => { finishFirst = resolve; });
    let patchRequests = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/notes") return Promise.resolve(json({ notes: [note()] }));
      if (path === `/api/notes/${NOTE_ID}`) {
        patchRequests += 1;
        if (patchRequests === 1) return firstResponse;
        expect(init?.keepalive).toBe(true);
        return Promise.resolve(json({ note: note({ pinned: true, archived: true }) }));
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    const { result } = renderHook(() => useNotes(owner));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let first!: Promise<void>;
    act(() => { first = result.current.update(NOTE_ID, { pinned: true }); });
    await waitFor(() => expect(patchRequests).toBe(1));
    await act(async () => {
      await result.current.update(NOTE_ID, { archived: true }, { keepalive: true });
    });
    expect(patchRequests).toBe(2);

    await act(async () => {
      finishFirst(json({ note: note({ pinned: true }) }));
      await first;
    });
  });

  it("serializes mutations for one note and ignores stale responses", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    let finishFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => { finishFirst = resolve; });
    let patchRequests = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/notes") return Promise.resolve(json({ notes: [note()] }));
      if (path === `/api/notes/${NOTE_ID}`) {
        patchRequests += 1;
        if (patchRequests === 1) return firstResponse;
        return Promise.resolve(json({ note: note({ pinned: true, archived: true, updatedAt: 3 }) }));
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    const { result } = renderHook(() => useNotes(owner));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.update(NOTE_ID, { pinned: true }); });
    await waitFor(() => expect(patchRequests).toBe(1));
    act(() => { second = result.current.update(NOTE_ID, { archived: true }); });

    await waitFor(() => expect(patchRequests).toBe(1));
    expect(result.current.notes[0]).toMatchObject({ pinned: true, archived: true });

    await act(async () => {
      finishFirst(json({ note: note({ pinned: true, updatedAt: 2 }) }));
      await first;
    });
    await waitFor(() => expect(patchRequests).toBe(2));
    await act(async () => { await second; });

    expect(result.current.notes[0]).toMatchObject({ pinned: true, archived: true });
  });

  it("retains the failed operation and everything after it for a later replay", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    await addPendingOp(owner, { type: "update", noteId: NOTE_ID, payload: { pinned: true } });
    await addPendingOp(owner, { type: "update", noteId: NOTE_ID, payload: { archived: true } });
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    let replayAttempts = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/notes") return Promise.resolve(json({ notes: [note()] }));
      if (path === `/api/notes/${NOTE_ID}`) {
        replayAttempts += 1;
        return Promise.resolve(json({ error: "Unavailable" }, 503));
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    renderHook(() => useNotes(owner));
    await waitFor(() => expect(replayAttempts).toBe(1));

    const remaining = await getPendingOps(owner);
    expect(remaining).toHaveLength(2);
  });

  it("drops a permanently-rejected op instead of wedging the queue behind it", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    const GONE = "11111111111111111111111111111111";
    const OK = "22222222222222222222222222222222";
    // A 404 (note deleted elsewhere) is queued ahead of a good edit to another note.
    await addPendingOp(owner, { type: "update", noteId: GONE, payload: { pinned: true } });
    await addPendingOp(owner, { type: "update", noteId: OK, payload: { archived: true } });
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    let okPatched = false;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/notes") return Promise.resolve(json({ notes: [] }));
      if (path === `/api/notes/${GONE}`) return Promise.resolve(json({ error: "Not found" }, 404));
      if (path === `/api/notes/${OK}`) {
        okPatched = true;
        return Promise.resolve(json({ note: note({ id: OK, archived: true }) }));
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    renderHook(() => useNotes(owner));

    // The poison op is discarded and the following op still reaches the server;
    // the queue drains to empty rather than sticking on the dead entry forever.
    await waitFor(() => expect(okPatched).toBe(true));
    await waitFor(async () => expect(await getPendingOps(owner)).toHaveLength(0));
  });

  it("stamps pending ops in strictly increasing order within a millisecond", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const first = await addPendingOp(owner, { type: "create", noteId: "a", payload: {} });
    const second = await addPendingOp(owner, { type: "update", noteId: "a", payload: { body: "x" } });

    expect(second.createdAt).toBeGreaterThan(first.createdAt);
    const ops = await getPendingOps(owner);
    expect(ops.map((op) => op.type)).toEqual(["create", "update"]);
  });
});

it("keeps the newest edit when the original create response arrives last", async () => {
  const owner = `owner-${crypto.randomUUID()}`;
  let server: Note | undefined;
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/notes" && init?.method !== "POST") return json({ notes: [] });
    const patch = JSON.parse(String(init?.body));
    if (init?.method === "POST") {
      if (server) return json({ note: server });
      server = note({ ...patch, updatedAt: 2 });
      return new Promise<Response>((resolve) => { finish = resolve; });
    }
    if (init?.method === "PATCH") {
      expect(patch.expectedUpdatedAt).toBe(server?.updatedAt);
      server = { ...server!, ...patch, updatedAt: 3 };
      return json({ note: server });
    }
    throw new Error(`Unexpected request ${input}`);
  }));
  const { result } = renderHook(() => useNotes(owner));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  let creation!: Promise<Note | null>;
  act(() => { creation = result.current.create({ id: NOTE_ID, body: "initial", title: "Test" }); });
  await waitFor(() => expect(finish).toBeDefined());
  const initial = server!;
  await act(async () => { await result.current.update(NOTE_ID, { body: "latest" }, { keepalive: true }); });
  expect(server?.body).toBe("latest");
  await act(async () => { finish(json({ note: initial })); await creation; });
  expect(result.current.notes).toHaveLength(1);
  expect(result.current.notes[0]).toMatchObject({ id: NOTE_ID, body: "latest", updatedAt: 3 });
});
