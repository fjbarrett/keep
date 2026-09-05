import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotes } from "@/lib/useNotes";
import { readNoteDrafts } from "@/lib/noteDrafts";
import { readGuestNotes } from "@/lib/notesClient";
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it("retains guest text after a storage failure and retries without reloading", async () => {
  const { result } = renderHook(() => useNotes(null));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  let id = "";
  await act(async () => { id = (await result.current.create({ body: "original", title: "Title" }))!.id; });
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await act(async () => { await result.current.update(id, { body: "latest" }, { keepalive: true }); });
  expect(result.current.notes[0].body).toBe("latest");
  expect(result.current.error).toContain("could not save your local notes");
  expect(result.current.syncStatus).toBe("error");
  expect(readGuestNotes()[0].body).toBe("original");
  const exit = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(exit);
  expect(exit.defaultPrevented).toBe(true);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.notes[0].body).toBe("latest");
  storage.mockRestore();
  await act(async () => { await result.current.retryDrafts(); });
  expect(readGuestNotes()[0].body).toBe("latest");
  expect(result.current.error).toBeNull();
});

it("persists guest lifecycle changes before the save promise resolves", async () => {
  const { result } = renderHook(() => useNotes(null));
  await waitFor(() => expect(result.current.hydrated).toBe(true));
  await act(async () => {
    const note = await result.current.create({ body: "original", title: "Title" });
    expect(readGuestNotes()[0].id).toBe(note!.id);
    await result.current.update(note!.id, { body: "exit text" }, { keepalive: true });
    expect(readGuestNotes()[0].body).toBe("exit text");
  });
});

it("does not crash draft discovery when browser storage is disabled", () => {
  vi.spyOn(Storage.prototype, "length", "get").mockImplementation(() => {
    throw new DOMException("Disabled", "SecurityError");
  });
  expect(readNoteDrafts("owner")).toEqual([]);
});
