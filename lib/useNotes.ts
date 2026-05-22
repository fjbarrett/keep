"use client";

import { useCallback, useEffect, useState } from "react";
import { Note, Tint } from "./types";

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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ notes: Note[] }>("/api/notes");
      const guestNotes = readGuestNotes();
      if (guestNotes.length > 0) {
        const imported = await Promise.all(
          guestNotes.map((note) =>
            api<{ note: Note }>("/api/notes", {
              method: "POST",
              json: {
                title: note.title,
                body: note.body,
                tint: note.tint,
                pinned: note.pinned,
                archived: note.archived,
              },
            }),
          ),
        );
        clearGuestNotes();
        setNotes([...imported.map((item) => item.note), ...data.notes]);
      } else {
        setNotes(data.notes);
      }
      setIsGuest(false);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        setNotes(readGuestNotes());
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
    if (hydrated && isGuest) writeGuestNotes(notes);
  }, [hydrated, isGuest, notes]);

  const create = useCallback(async (partial: Partial<Note>) => {
    if (isGuest) {
      const now = Date.now();
      const note: Note = {
        id: localId(),
        title: partial.title ?? "",
        body: partial.body ?? "",
        tint: partial.tint ?? "natural",
        pinned: partial.pinned ?? false,
        archived: partial.archived ?? false,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => [note, ...prev]);
      return note;
    }

    try {
      const data = await api<{ note: Note }>("/api/notes", {
        method: "POST",
        json: {
          title: partial.title ?? "",
          body: partial.body ?? "",
          tint: partial.tint ?? "natural",
          pinned: partial.pinned ?? false,
          archived: partial.archived ?? false,
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
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      ),
    );
    if (isGuest) return;

    try {
      const data = await api<{ note: Note }>(`/api/notes/${id}`, {
        method: "PATCH",
        json: patch,
      });
      setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      refresh();
    }
  }, [isGuest, refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = notes;
    setNotes((p) => p.filter((n) => n.id !== id));
    if (isGuest) return;

    try {
      await api(`/api/notes/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setNotes(prev);
    }
  }, [isGuest, notes]);

  const importKeepFile = useCallback(async (file: File) => {
    if (isGuest) {
      const { parseGoogleKeepImport } = await import("./googleKeepImport");
      const { notes: imported, skipped } = await parseGoogleKeepImport(
        file.name,
        await file.arrayBuffer(),
      );
      const now = Date.now();
      const importable = imported.filter((note) => !note.trashed);
      const guestNotes: Note[] = importable.map((note, index) => ({
        id: `${localId()}${index.toString(36).toUpperCase()}`,
        title: "",
        body: note.body,
        tint: note.tint,
        pinned: note.pinned,
        archived: note.archived,
        createdAt: note.createdAt || now,
        updatedAt: note.updatedAt || now,
      }));
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
      });
    },
    [notes, update],
  );

  const setTint = useCallback(
    (id: string, tint: Tint) => {
      update(id, { tint });
    },
    [update],
  );

  return {
    notes,
    hydrated,
    isGuest,
    error,
    refresh,
    create,
    update,
    remove,
    importKeepFile,
    togglePin,
    toggleArchive,
    setTint,
  };
}
