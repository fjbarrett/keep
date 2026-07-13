"use client";

import { deleteDB, openDB, type IDBPDatabase } from "idb";
import { Note } from "./types";

const DB_PREFIX = "keep-offline-v2";
const LEGACY_DB_NAME = "keep-offline";
const DB_VERSION = 1;

export type PendingOp = {
  id: string;
  type: "create" | "update" | "delete";
  noteId: string;
  payload?: Partial<Note>;
  createdAt: number;
};

const dbPromises = new Map<string, Promise<IDBPDatabase>>();
let legacyMigrationStarted = false;

function databaseName(ownerId: string) {
  return `${DB_PREFIX}:${encodeURIComponent(ownerId)}`;
}

// The legacy database wasn't owner-scoped. Pending creates contain full note
// bodies, so assigning them to whichever account opens first can disclose one
// person's offline note to another person on a shared browser profile. There is
// no reliable owner identity to recover; discard the database in full.
async function discardLegacyDatabase() {
  if (legacyMigrationStarted) return;
  legacyMigrationStarted = true;
  let legacy: IDBPDatabase | null = null;
  try {
    legacy = await openDB(LEGACY_DB_NAME, DB_VERSION);
  } catch {
    /* no legacy DB, or it was unreadable */
  } finally {
    legacy?.close();
    await deleteDB(LEGACY_DB_NAME).catch(() => {});
  }
}

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
    }).then(async (db) => {
      await discardLegacyDatabase();
      return db;
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

// Replay reads ops by the createdAt index, and IndexedDB breaks ties on the
// random id suffix — so two ops stamped in the same millisecond (e.g. a create
// and the update for text typed during it) could replay out of order, PATCHing
// a note the server hasn't created yet. Hand out strictly increasing stamps so
// insertion order is preserved.
let lastStamp = 0;
function nextStamp() {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

export async function addPendingOp(
  ownerId: string,
  op: Omit<PendingOp, "id" | "createdAt">,
) {
  const stamp = nextStamp();
  const entry: PendingOp = {
    ...op,
    id: `${stamp}-${crypto.randomUUID()}`,
    createdAt: stamp,
  };
  await (await getDb(ownerId)).put("pending", entry);
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
