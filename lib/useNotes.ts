"use client";

import { useCallback, useEffect, useState } from "react";
import { Note, Tint } from "./types";

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
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ notes: Note[] }>("/api/notes");
      setNotes(data.notes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (partial: Partial<Note>) => {
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
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      ),
    );
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
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = notes;
    setNotes((p) => p.filter((n) => n.id !== id));
    try {
      await api(`/api/notes/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setNotes(prev);
    }
  }, [notes]);

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
    error,
    refresh,
    create,
    update,
    remove,
    togglePin,
    toggleArchive,
    setTint,
  };
}
