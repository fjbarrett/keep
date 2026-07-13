import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
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
  it("migrates un-replayed legacy pending ops into the first per-owner DB", async () => {
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

    await expect(getPendingOps(`new-owner-${crypto.randomUUID()}`)).resolves.toEqual([op]);
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
