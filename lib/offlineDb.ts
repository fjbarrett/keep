"use client";

import { openDB, type IDBPDatabase } from "idb";
import { Note } from "./types";

const DB_NAME = "keep-offline";
const DB_VERSION = 1;

interface PendingOp {
  id: string;
  type: "create" | "update" | "delete";
  noteId: string;
  payload?: Partial<Note>;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notes")) {
          db.createObjectStore("notes", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("pending")) {
          const store = db.createObjectStore("pending", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheNotes(notes: Note[]) {
  const db = await getDb();
  const tx = db.transaction("notes", "readwrite");
  const store = tx.objectStore("notes");
  await store.clear();
  for (const note of notes) {
    await store.put(note);
  }
  await tx.done;
}

export async function getCachedNotes(): Promise<Note[]> {
  const db = await getDb();
  return db.getAll("notes");
}

export async function cacheNote(note: Note) {
  const db = await getDb();
  await db.put("notes", note);
}

export async function removeCachedNote(id: string) {
  const db = await getDb();
  await db.delete("notes", id);
}

export async function addPendingOp(op: Omit<PendingOp, "id" | "createdAt">) {
  const db = await getDb();
  const entry: PendingOp = {
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  await db.put("pending", entry);
}

export async function getPendingOps(): Promise<PendingOp[]> {
  const db = await getDb();
  return db.getAllFromIndex("pending", "createdAt");
}

export async function clearPendingOps() {
  const db = await getDb();
  const tx = db.transaction("pending", "readwrite");
  await tx.objectStore("pending").clear();
  await tx.done;
}
