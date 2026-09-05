import type { Note } from "./types";
import type { PendingOp } from "./offlineDb";
import { inferNoteTitle } from "./inferTitle";

/** Apply the outbox in its transaction order before exposing a server refresh. */
export function overlayPendingNotes(server: Note[], cached: Note[], ops: PendingOp[]): Note[] {
  const merged = new Map(server.map((note) => [note.id, note]));
  const fallback = new Map(cached.map((note) => [note.id, note]));
  for (const op of ops) {
    if (op.type === "delete") { merged.delete(op.noteId); continue; }
    if (!op.payload) continue;
    let base = merged.get(op.noteId) ?? fallback.get(op.noteId);
    if (!base && typeof op.payload.body === "string") {
      base = { id: op.noteId, title: inferNoteTitle(op.payload.body), body: op.payload.body,
        pinned: false, archived: false, trashed: false, markdown: false, highlight: false,
        tags: [], shareToken: null, createdAt: op.createdAt, updatedAt: op.createdAt };
    }
    if (base) merged.set(op.noteId, { ...base, ...op.payload, id: op.noteId });
  }
  return [...merged.values()];
}
