import { readNoteDrafts, writeNoteDraft } from "@/lib/noteDrafts";
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";
import {
  addPendingOp,
  cacheNotes,
  clearOwnerData,
  getCachedNotes,
  getPendingOps,
  removePendingOp,
} from "@/lib/offlineDb";
import type { Note } from "@/lib/types";

afterEach(() => vi.restoreAllMocks());

function note(id: string, body: string): Note {
  return {
    id,
    title: body,
    summary: null,
    color: null,
    body,
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

describe("account-scoped offline storage", () => {
  it("writes only changed notes while removing rows absent from a refresh", async () => {
    const owner = crypto.randomUUID();
    const initial = [note("a", "unchanged"), note("b", "before"), note("c", "removed")];
    await cacheNotes(owner, initial);
    const put = vi.spyOn(IDBObjectStore.prototype, "put");
    const update = vi.spyOn(IDBCursor.prototype, "update");
    const remove = vi.spyOn(IDBCursor.prototype, "delete");
    await cacheNotes(owner, structuredClone(initial));
    expect(put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    const next = [initial[0], note("b", "after"), note("d", "added")];
    await cacheNotes(owner, next);
    expect(put).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(await getCachedNotes(owner)).toEqual(next);
  });

  it("quarantines ownerless legacy operations without deleting them", async () => {
    const legacy = await openDB("keep-offline", 1, {
      upgrade(db) {
        db.createObjectStore("notes", { keyPath: "id" });
        db.createObjectStore("pending", { keyPath: "id" });
      },
    });
    const op = {
      id: "legacy-create",
      type: "create",
      noteId: "legacy-note",
      payload: note("legacy-note", "offline draft made before the per-owner split"),
      createdAt: 1,
    };
    await legacy.put("pending", op);
    legacy.close();

    await expect(getPendingOps(`new-owner-${crypto.randomUUID()}`)).resolves.toEqual([]);
    const preserved = await openDB("keep-offline", 1);
    expect(await preserved.getAll("pending")).toEqual([op]);
    preserved.close();
  });

  it("never returns one account's cached notes to another account", async () => {
    const firstOwner = `first-${crypto.randomUUID()}`;
    const secondOwner = `second-${crypto.randomUUID()}`;
    await cacheNotes(firstOwner, [note("a", "first account")]);
    await cacheNotes(secondOwner, [note("b", "second account")]);

    await expect(getCachedNotes(firstOwner)).resolves.toEqual([note("a", "first account")]);
    await expect(getCachedNotes(secondOwner)).resolves.toEqual([note("b", "second account")]);
  });

  it("removes only operations that actually replayed", async () => {
    const owner = `owner-${crypto.randomUUID()}`;
    const first = await addPendingOp(owner, {
      type: "update",
      noteId: "a",
      payload: { body: "first" },
    });
    const second = await addPendingOp(owner, {
      type: "update",
      noteId: "b",
      payload: { body: "second" },
    });

    await removePendingOp(owner, first.id);
    await expect(getPendingOps(owner)).resolves.toEqual([second]);
  });

  it("removes cached notes and pending edits on explicit sign-out", async () => {
    const owner = `signout-${crypto.randomUUID()}`;
    await cacheNotes(owner, [note("private", "local copy")]);
    await addPendingOp(owner, {
      type: "update",
      noteId: "private",
      payload: { body: "queued private edit" },
    });

    await clearOwnerData(owner);
    await expect(getCachedNotes(owner)).resolves.toEqual([]);
    await expect(getPendingOps(owner)).resolves.toEqual([]);
  });
});

it("rejects a stale tab's writes after sign-out clears account storage", async () => {
  const owner = crypto.randomUUID();
  const draft = { note: note("a".repeat(32), "Private text"), patch: {}, type: "create" as const };
  writeNoteDraft(owner, draft);
  await clearOwnerData(owner);
  expect(() => writeNoteDraft(owner, draft)).toThrow("signed out");
  await expect(cacheNotes(owner, [draft.note])).rejects.toThrow("signed out");
  await expect(addPendingOp(owner, { type: "create", noteId: draft.note.id, payload: draft.note })).rejects.toThrow("signed out");
  expect(readNoteDrafts(owner)).toEqual([]);
  expect(await getCachedNotes(owner)).toEqual([]);
});
