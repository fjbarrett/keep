"use client";

import { openDB, type IDBPDatabase } from "idb";
import { clearNoteDrafts } from "./noteDrafts";
import { Note } from "./types";

const DB_PREFIX = "keep-offline-v2";
const DB_VERSION = 1;

export type PendingOp = {
  id: string;
  type: "create" | "update" | "delete";
  noteId: string;
  payload?: Partial<Note>;
  createdAt: number;
};

const dbPromises = new Map<string, Promise<IDBPDatabase>>();

function databaseName(ownerId: string) {
  return `${DB_PREFIX}:${encodeURIComponent(ownerId)}`;
}

// The ownerless legacy database stays quarantined in place. Never copy its
// private pending bodies into whichever account happens to sign in next.
// Recovery requires independently established ownership; do not delete it.

function getDb(ownerId: string) {
  const name = databaseName(ownerId);
  let promise = dbPromises.get(name);
  if (!promise) {
    promise = openDB(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("notes", { keyPath: "id" });
        const pending = db.createObjectStore("pending", { keyPath: "id" });
        pending.createIndex("createdAt", "createdAt");
      },
    });
    dbPromises.set(name, promise);
  }
  return promise;
}

export async function cacheNotes(ownerId: string, notes: Note[]) {
  const db = await getDb(ownerId);
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  await store.clear();
  for (const note of notes) await store.put(note);
  await tx.done;
}

export async function getCachedNotes(ownerId: string): Promise<Note[]> {
  return (await getDb(ownerId)).getAll("notes");
}

export async function cacheNote(ownerId: string, note: Note) {
  await (await getDb(ownerId)).put("notes", note);
}

export async function removeCachedNote(ownerId: string, id: string) {
  await (await getDb(ownerId)).delete("notes", id);
}

export async function addPendingOp(
  ownerId: string,
  op: Omit<PendingOp, "id" | "createdAt">,
) {
  const db = await getDb(ownerId);
  // A read/write transaction serializes stamp allocation across every tab.
  const tx = db.transaction("pending", "readwrite");
  const last = await tx.store.index("createdAt").openCursor(null, "prev");
  const stamp = Math.max(Date.now(), (last?.value.createdAt ?? 0) + 1);
  const entry: PendingOp = {
    ...op,
    id: `${stamp}-${crypto.randomUUID()}`,
    createdAt: stamp,
  };
  await tx.store.put(entry);
  await tx.done;
  return entry;
}

export async function getPendingOps(ownerId: string): Promise<PendingOp[]> {
  return (await getDb(ownerId)).getAllFromIndex("pending", "createdAt");
}

export async function removePendingOp(ownerId: string, id: string) {
  await (await getDb(ownerId)).delete("pending", id);
}

/** Remove cached notes and queued mutations when the user explicitly signs out. */
export async function clearOwnerData(ownerId: string) {
  clearNoteDrafts(ownerId);
  const name = databaseName(ownerId);
  const db = await getDb(ownerId);
  const tx = db.transaction(["notes", "pending"], "readwrite");
  await Promise.all([
    tx.objectStore("notes").clear(),
    tx.objectStore("pending").clear(),
  ]);
  await tx.done;
  db.close();
  dbPromises.delete(name);
}
