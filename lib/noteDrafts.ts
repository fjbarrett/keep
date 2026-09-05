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
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix(owner))) continue;
    try {
      const draft = JSON.parse(localStorage.getItem(key) ?? "null");
      if (draft?.note?.id && key === prefix(owner) + draft.note.id &&
          typeof draft.note.body === "string" && draft.revision) drafts.push(draft);
    } catch { /* Keep unreadable records for manual recovery. */ }
  }
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
