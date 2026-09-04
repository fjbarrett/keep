import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/lib/types";

const offlineDb = vi.hoisted(() => ({
  addPendingOp: vi.fn(),
  cacheNote: vi.fn(),
  cacheNotes: vi.fn(),
  getCachedNotes: vi.fn(),
  getPendingOps: vi.fn(),
  removeCachedNote: vi.fn(),
  removePendingOp: vi.fn(),
}));

vi.mock("@/lib/offlineDb", () => offlineDb);

import { useNotes } from "@/lib/useNotes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function note(title: string): Note {
  return {
    id: "0123456789abcdef0123456789abcdef",
    title,
    summary: null,
    color: null,
    body: title,
    pinned: false,
    archived: false,
    trashed: false,
    markdown: false,
    highlight: false,
    tags: [],
    shareToken: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  localStorage.clear();
  for (const mock of Object.values(offlineDb)) mock.mockReset();
  offlineDb.addPendingOp.mockResolvedValue(undefined);
  offlineDb.cacheNote.mockResolvedValue(undefined);
  offlineDb.cacheNotes.mockResolvedValue(undefined);
  offlineDb.getPendingOps.mockResolvedValue([]);
  offlineDb.removeCachedNote.mockResolvedValue(undefined);
  offlineDb.removePendingOp.mockResolvedValue(undefined);
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useNotes hydration", () => {
  it("starts the server request without waiting for IndexedDB", async () => {
    const cachedRead = deferred<Note[]>();
    const network = deferred<Response>();
    offlineDb.getCachedNotes.mockReturnValue(cachedRead.promise);
    vi.stubGlobal("fetch", vi.fn(() => network.promise));

    const { result } = renderHook(() => useNotes("owner"));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/notes",
      expect.any(Object),
    ));
    expect(result.current.hydrated).toBe(false);

    await act(async () => cachedRead.resolve([note("Cached")]));
    await waitFor(() => expect(result.current.notes[0]?.title).toBe("Cached"));

    await act(async () => network.resolve(json({ notes: [note("Server")] })));
    await waitFor(() => expect(result.current.notes[0]?.title).toBe("Server"));
  });

  it("does not let a late stale cache replace the server response", async () => {
    const cachedRead = deferred<Note[]>();
    offlineDb.getCachedNotes.mockReturnValue(cachedRead.promise);
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(json({ notes: [note("Server")] })),
    ));

    const { result } = renderHook(() => useNotes("owner"));
    await waitFor(() => expect(result.current.notes[0]?.title).toBe("Server"));

    await act(async () => cachedRead.resolve([note("Stale cache")]));
    expect(result.current.notes[0]?.title).toBe("Server");
  });

  it("preserves the cached array when the server snapshot is unchanged", async () => {
    const cachedNotes = [note("Same")];
    const network = deferred<Response>();
    offlineDb.getCachedNotes.mockResolvedValue(cachedNotes);
    vi.stubGlobal("fetch", vi.fn(() => network.promise));

    const { result } = renderHook(() => useNotes("owner"));
    await waitFor(() => expect(result.current.notes).toBe(cachedNotes));

    await act(async () => network.resolve(json({ notes: [note("Same")] })));
    await waitFor(() => expect(offlineDb.cacheNotes).toHaveBeenCalledOnce());
    expect(result.current.notes).toBe(cachedNotes);
  });

  it("commits the fresh snapshot to IndexedDB before presenting it", async () => {
    const cacheWrite = deferred<void>();
    offlineDb.getCachedNotes.mockResolvedValue([]);
    offlineDb.cacheNotes.mockReturnValue(cacheWrite.promise);
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(json({ notes: [note("Server")] })),
    ));

    const { result } = renderHook(() => useNotes("owner"));
    await waitFor(() => expect(offlineDb.cacheNotes).toHaveBeenCalledOnce());
    expect(result.current.notes).toEqual([]);
    expect(result.current.hydrated).toBe(false);

    await act(async () => cacheWrite.resolve());
    await waitFor(() => expect(result.current.notes[0]?.title).toBe("Server"));
    expect(result.current.hydrated).toBe(true);
  });

  it("still presents the server snapshot when IndexedDB cannot be updated", async () => {
    const cacheError = new Error("quota exceeded");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    offlineDb.getCachedNotes.mockResolvedValue([]);
    offlineDb.cacheNotes.mockRejectedValue(cacheError);
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(json({ notes: [note("Server")] })),
    ));

    const { result } = renderHook(() => useNotes("owner"));

    await waitFor(() => expect(result.current.notes[0]?.title).toBe("Server"));
    expect(result.current.hydrated).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "Could not refresh the offline note cache.",
      cacheError,
    );
  });
});
