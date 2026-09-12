import type { Note } from "./types";

export type NoteDraft = {
  note: Note;
  patch: Partial<Note>;
  type: "create" | "update";
  revision: string;
  base?: Note;
  predecessors?: string[];
};
const prefix = (owner: string) => `keep.draft.v1.${encodeURIComponent(owner)}.`;

export function readNoteDrafts(owner: string): NoteDraft[] {
  const drafts: NoteDraft[] = [];
  try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(owner))) continue;
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? "null");
      if (draft?.note?.id && key === prefix(owner) + draft.note.id &&
          typeof draft.note.body === "string" && draft.revision) drafts.push(draft);
    } catch { /* Keep unreadable records for manual recovery. */ }
  }
  } catch { /* Storage may be disabled; writes surface an actionable error. */ }
  return drafts;
}

/** Synchronous journal: accepted edits survive navigation before a fetch starts. */
export function writeNoteDraft(owner: string, draft: Omit<NoteDraft, "revision">): NoteDraft {
  const entry = { ...draft, revision: crypto.randomUUID() };
  localStorage.setItem(prefix(owner) + draft.note.id, JSON.stringify(entry));
  return entry;
}

/** Update the saved base without changing the identity of an in-flight draft. */
export function replaceNoteDraft(owner: string, draft: NoteDraft) {
  const key = prefix(owner) + draft.note.id;
  const current = JSON.parse(localStorage.getItem(key) ?? "null");
  if (current?.revision === draft.revision) localStorage.setItem(key, JSON.stringify(draft));
}

export function removeNoteDraft(owner: string, draft: NoteDraft) {
  const key = prefix(owner) + draft.note.id;
  const current = JSON.parse(localStorage.getItem(key) ?? "null");
  if (current?.revision === draft.revision) localStorage.removeItem(key);
}

const equal = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

function draftMatchesServer(draft: NoteDraft, server: Note | undefined) {
  if (!server) return false;
  const intended = draft.type === "create"
    ? [
        ["title", draft.note.title],
        ["summary", draft.note.summary],
        ["color", draft.note.color],
        ["body", draft.note.body],
        ["pinned", draft.note.pinned],
        ["archived", draft.note.archived],
        ["trashed", draft.note.trashed],
        ["markdown", draft.note.markdown],
        ["highlight", draft.note.highlight],
        ["tags", draft.note.tags],
      ]
    : Object.entries(draft.patch);
  return intended.every(([key, value]) =>
    equal(server[key as keyof Note], value));
}

/** Remove journals left behind after the server committed an exit save. */
export function discardAcknowledgedNoteDrafts(owner: string, serverNotes: Note[]) {
  const serverById = new Map(serverNotes.map((note) => [note.id, note]));
  for (const draft of readNoteDrafts(owner)) {
    if (draftMatchesServer(draft, serverById.get(draft.note.id))) {
      removeNoteDraft(owner, draft);
    }
  }
  // Re-read so a newer revision written during reconciliation is preserved.
  return readNoteDrafts(owner);
}

export function clearNoteDrafts(owner: string) {
  for (const draft of readNoteDrafts(owner)) removeNoteDraft(owner, draft);
}

export function overlayNoteDrafts(notes: Note[], drafts: NoteDraft[]) {
  const merged = new Map(notes.map((note) => [note.id, note]));
  for (const draft of drafts) merged.set(draft.note.id, {
    ...(merged.get(draft.note.id) ?? draft.note), ...draft.patch,
    id: draft.note.id, updatedAt: draft.note.updatedAt,
  });
  return [...merged.values()];
}
