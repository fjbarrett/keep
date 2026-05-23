"use client";

import { useCallback, useEffect, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "./inferTitle";
import { Note } from "./types";

const GUEST_NOTES_KEY = "keep.guestNotes.v1";

function localId() {
  return (
    "L" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  ).toUpperCase();
}

function readGuestNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredNote).filter((note): note is Note => Boolean(note));
  } catch {
    return [];
  }
}

function normalizeStoredNote(value: unknown): Note | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Note;
  const body = String(note.body ?? "");
  const title = String(note.title ?? "");
  return {
    ...note,
    title: needsInferredTitle(title, body) ? inferNoteTitle(body || title) : title,
    body,
    trashed: Boolean(note.trashed),
    markdown: Boolean(note.markdown),
    shareToken: note.shareToken ?? null,
  };
}

function writeGuestNotes(notes: Note[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_NOTES_KEY, JSON.stringify(notes));
}

function clearGuestNotes() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_NOTES_KEY);
}

async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.json
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
    body: init?.json ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function titleForBody(body: string) {
  try {
    const data = await api<{ title: string }>("/api/notes/title", {
      method: "POST",
      json: { body },
    });
    return data.title || inferNoteTitle(body);
  } catch {
    return inferNoteTitle(body);
  }
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [localNoteIds, setLocalNoteIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ notes: Note[] }>("/api/notes");
      const guestNotes = readGuestNotes();
      if (guestNotes.length > 0) {
        setLocalNoteIds(new Set(guestNotes.map((note) => note.id)));
        setNotes([...guestNotes, ...data.notes]);
      } else {
        setLocalNoteIds(new Set());
        setNotes(data.notes);
      }
      setIsGuest(false);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        const guestNotes = readGuestNotes();
        setLocalNoteIds(new Set(guestNotes.map((note) => note.id)));
        setNotes(guestNotes);
        setIsGuest(true);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hydrated) return;
    if (isGuest || localNoteIds.size > 0) {
      writeGuestNotes(notes.filter((note) => isGuest || localNoteIds.has(note.id)));
    }
  }, [hydrated, isGuest, localNoteIds, notes]);

  const create = useCallback(async (partial: Partial<Note>) => {
    const body = partial.body ?? "";
    const title = partial.title || await titleForBody(body);
    if (isGuest) {
      const now = Date.now();
      const note: Note = {
        id: localId(),
        title,
        body,
        pinned: partial.pinned ?? false,
        archived: partial.archived ?? false,
        trashed: false,
        markdown: partial.markdown ?? false,
        shareToken: null,
        createdAt: now,
        updatedAt: now,
      };
      setLocalNoteIds((prev) => new Set(prev).add(note.id));
      setNotes((prev) => [note, ...prev]);
      return note;
    }

    try {
      const data = await api<{ note: Note }>("/api/notes", {
        method: "POST",
        json: {
          title,
          body,
          pinned: partial.pinned ?? false,
          archived: partial.archived ?? false,
          trashed: false,
          markdown: partial.markdown ?? false,
        },
      });
      setNotes((prev) => [data.note, ...prev]);
      return data.note;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
      return null;
    }
  }, [isGuest]);

  const update = useCallback(async (id: string, patch: Partial<Note>) => {
    const current = notes.find((note) => note.id === id);
    const bodyChanged =
      patch.body !== undefined && patch.body !== (current?.body ?? "");
    const nextPatch =
      bodyChanged && patch.body !== undefined
        ? { ...patch, title: await titleForBody(patch.body) }
        : patch;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...nextPatch, updatedAt: Date.now() } : n,
      ),
    );
    if (isGuest || localNoteIds.has(id)) return;

    try {
      const data = await api<{ note: Note }>(`/api/notes/${id}`, {
        method: "PATCH",
        json: nextPatch,
      });
      setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      refresh();
    }
  }, [isGuest, localNoteIds, notes, refresh]);

  const trash = useCallback(async (id: string) => {
    const n = notes.find((note) => note.id === id);
    if (!n) return;
    update(id, { trashed: true, pinned: false, archived: false });
  }, [notes, update]);

  const restore = useCallback(async (id: string) => {
    const n = notes.find((note) => note.id === id);
    if (!n) return;
    update(id, { trashed: false, archived: false });
  }, [notes, update]);

  const remove = useCallback(async (id: string) => {
    const prev = notes;
    setNotes((p) => p.filter((n) => n.id !== id));
    if (isGuest || localNoteIds.has(id)) {
      setLocalNoteIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      return;
    }

    try {
      await api(`/api/notes/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setNotes(prev);
    }
  }, [isGuest, localNoteIds, notes]);

  const importKeepFile = useCallback(async (file: File) => {
    if (isGuest) {
      const { parseGoogleKeepImport } = await import("./googleKeepImport");
      const { notes: imported, skipped } = await parseGoogleKeepImport(
        file.name,
        await file.arrayBuffer(),
      );
      const now = Date.now();
      const importable = imported.filter((note) => !note.trashed);
      const guestNotes: Note[] = [];
      for (const [index, note] of importable.entries()) {
        guestNotes.push({
          id: `${localId()}${index.toString(36).toUpperCase()}`,
          title: await titleForBody(note.body),
          body: note.body,
          pinned: note.pinned,
          archived: note.archived,
          trashed: false,
          markdown: false,
          shareToken: null,
          createdAt: note.createdAt || now,
          updatedAt: note.updatedAt || now,
        });
      }
      setLocalNoteIds((prev) => {
        const next = new Set(prev);
        for (const note of guestNotes) next.add(note.id);
        return next;
      });
      setNotes((prev) => [...guestNotes, ...prev]);
      return {
        imported: guestNotes.length,
        skipped: skipped + imported.length - importable.length,
        duplicates: 0,
      };
    }

    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/notes/import", {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Import failed");
    }
    const result = (await res.json()) as {
      imported: number;
      skipped: number;
      duplicates: number;
    };
    await refresh();
    return result;
  }, [isGuest, refresh]);

  const saveLocalNotes = useCallback(async () => {
    const localNotes = notes.filter(
      (note) => localNoteIds.has(note.id) && !note.trashed,
    );
    if (localNotes.length === 0) return { saved: 0 };

    const imported = await Promise.all(
      localNotes.map((note) =>
        api<{ note: Note }>("/api/notes", {
          method: "POST",
          json: {
            title: "",
            body: note.body,
            pinned: note.pinned,
            archived: note.archived,
            trashed: false,
            markdown: note.markdown,
          },
        }),
      ),
    );
    clearGuestNotes();
    setLocalNoteIds(new Set());
    setNotes((prev) => [
      ...imported.map((item) => item.note),
      ...prev.filter((note) => !localNoteIds.has(note.id)),
    ]);
    return { saved: imported.length };
  }, [localNoteIds, notes]);

  const togglePin = useCallback(
    (id: string) => {
      const n = notes.find((x) => x.id === id);
      if (!n) return;
      update(id, { pinned: !n.pinned });
    },
    [notes, update],
  );

  const toggleArchive = useCallback(
    (id: string) => {
      const n = notes.find((x) => x.id === id);
      if (!n) return;
      const becomingArchived = !n.archived;
      update(id, {
        archived: becomingArchived,
        pinned: becomingArchived ? false : n.pinned,
        trashed: false,
      });
    },
    [notes, update],
  );

  const share = useCallback(
    async (id: string) => {
      if (isGuest || localNoteIds.has(id)) return null;
      try {
        const data = await api<{ note: Note }>(`/api/notes/${id}/share`, {
          method: "POST",
        });
        setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
        return data.note.shareToken;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to share");
        return null;
      }
    },
    [isGuest, localNoteIds],
  );

  const unshare = useCallback(
    async (id: string) => {
      if (isGuest || localNoteIds.has(id)) return;
      try {
        const data = await api<{ note: Note }>(`/api/notes/${id}/share`, {
          method: "DELETE",
        });
        setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to unshare");
      }
    },
    [isGuest, localNoteIds],
  );

  return {
    notes,
    hydrated,
    isGuest,
    hasLocalNotes: localNoteIds.size > 0,
    error,
    refresh,
    create,
    update,
    remove,
    trash,
    restore,
    share,
    unshare,
    importKeepFile,
    saveLocalNotes,
    togglePin,
    toggleArchive,
  };
}
