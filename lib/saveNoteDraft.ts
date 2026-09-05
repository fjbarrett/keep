import type { Note } from "./types";
import { notesApi, NotesApiError } from "./notesClient";
import { readNoteDrafts, replaceNoteDraft, removeNoteDraft, type NoteDraft } from "./noteDrafts";

const conflict = (note?: Note) => new NotesApiError(
  "This note changed elsewhere. Your draft is kept on this device; save a copy to keep both versions.", 409, note,
);
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Every body PATCH names the version its draft was based on. */
export async function saveNoteDraft(owner: string, submitted: NoteDraft, options: { keepalive?: boolean } = {}) {
  const current = readNoteDrafts(owner).find((draft) => draft.note.id === submitted.note.id);
  const draft = current?.revision === submitted.revision ? current : submitted;
  let base = draft.base;
  const patch = draft.type === "create" ? { ...draft.note } : draft.patch;
  let saved: Note | undefined;
  if (draft.type === "create") {
    const data = await notesApi<{ note: Note }>("/api/notes", {
      method: "POST", ...options, json: { ...draft.note, ownerId: owner },
    });
    if (data.note.body === draft.note.body) saved = data.note;
    else if (draft.predecessors?.includes(data.note.body)) base = data.note;
    else throw conflict(data.note);
  }
  for (let attempt = 0; !saved && attempt < 3; attempt++) {
    if (patch.body !== undefined && !base) throw conflict();
    try {
      const data = await notesApi<{ note: Note }>(`/api/notes/${draft.note.id}`, {
        method: "PATCH", ...options, json: { ...patch, ...(base ? { expectedUpdatedAt: base.updatedAt } : {}) },
      });
      saved = data.note;
    } catch (error) {
      const remote = error instanceof NotesApiError && error.status === 409 ? error.note : undefined;
      if (!remote) throw error;
      if (Object.entries(patch).every(([key, value]) => equal(remote[key as keyof Note], value))) {
        saved = remote; // A previous request committed but its acknowledgement was lost.
      } else if (patch.body === undefined || remote.body === base?.body || draft.predecessors?.includes(remote.body)) {
        base = remote; // A metadata-only edit or an acknowledged earlier local body.
      } else throw conflict(remote);
    }
  }
  if (!saved) throw conflict(base);
  const latest = readNoteDrafts(owner).find((entry) => entry.note.id === draft.note.id);
  if (latest?.revision === draft.revision) removeNoteDraft(owner, latest);
  else if (latest && (!latest.base || saved.updatedAt > latest.base.updatedAt) &&
      (latest.base?.updatedAt === draft.base?.updatedAt || latest.predecessors?.includes(saved.body))) {
    replaceNoteDraft(owner, { ...latest, base: saved, type: "update" });
  }
  return saved;
}
