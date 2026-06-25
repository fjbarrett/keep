"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "./inferTitle";
import { Note } from "./types";
import {
  cacheNotes,
  getCachedNotes,
  cacheNote,
  removeCachedNote,
  addPendingOp,
  getPendingOps,
  clearPendingOps,
} from "./offlineDb";

const GUEST_NOTES_KEY = "keep.guestNotes.v1";

function localId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
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
    highlight: Boolean(note.highlight),
    tags: Array.isArray(note.tags) ? note.tags : [],
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

function firstLine(body: string) {
  return body.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

async function metaForBody(body: string): Promise<{ title: string; summary: string }> {
  try {
    const data = await api<{ title: string; summary?: string }>("/api/notes/title", {
      method: "POST",
      json: { body },
    });
    return { title: data.title || inferNoteTitle(body), summary: data.summary ?? "" };
  } catch {
    return { title: inferNoteTitle(body), summary: "" };
  }
}

export type SyncStatus = "idle" | "syncing" | "saved" | "error" | "offline";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [localNoteIds, setLocalNoteIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const inflightRef = useRef(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function goOffline() { setSyncStatus("offline"); }
    function goOnline() { setSyncStatus("idle"); }
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (!navigator.onLine) setSyncStatus("offline");
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  function trackSync<T>(promise: Promise<T>): Promise<T> {
    inflightRef.current++;
    setSyncStatus("syncing");
    return promise.then(
      (result) => {
        inflightRef.current--;
        if (inflightRef.current === 0) {
          setSyncStatus("saved");
          clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSyncStatus("idle"), 2000);
        }
        return result;
      },
      (err) => {
        inflightRef.current--;
        setSyncStatus("error");
        throw err;
      },
    );
  }

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
        cacheNotes(data.notes).catch(() => {});
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
        const cached = await getCachedNotes().catch(() => []);
        if (cached.length > 0) {
          setNotes(cached);
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    getCachedNotes()
      .then((cached) => {
        if (cached.length > 0) {
          setNotes(cached);
          setHydrated(true);
        }
      })
      .catch(() => {})
      .finally(() => refresh());
  }, [refresh]);

  useEffect(() => {
    if (!hydrated) return;
    if (isGuest || localNoteIds.size > 0) {
      writeGuestNotes(notes.filter((note) => isGuest || localNoteIds.has(note.id)));
    }
  }, [hydrated, isGuest, localNoteIds, notes]);

  const syncingRef = useRef(false);
  useEffect(() => {
    async function replayPending() {
      if (syncingRef.current || isGuest) return;
      syncingRef.current = true;
      try {
        const ops = await getPendingOps();
        for (const op of ops) {
          try {
            if (op.type === "update" && op.payload) {
              await api(`/api/notes/${op.noteId}`, { method: "PATCH", json: op.payload });
            } else if (op.type === "delete") {
              await api(`/api/notes/${op.noteId}`, { method: "DELETE" });
            }
          } catch { /* individual op failed, will retry next time */ }
        }
        if (ops.length > 0) {
          await clearPendingOps();
          refresh();
        }
      } finally {
        syncingRef.current = false;
      }
    }
    function onOnline() { replayPending(); }
    window.addEventListener("online", onOnline);
    if (hydrated && navigator.onLine) replayPending();
    return () => window.removeEventListener("online", onOnline);
  }, [hydrated, isGuest, refresh]);

  const create = useCallback(async (partial: Partial<Note>) => {
    const body = partial.body ?? "";
    const meta = partial.title
      ? { title: partial.title, summary: partial.summary ?? "" }
      : await metaForBody(body);
    if (isGuest) {
      const now = Date.now();
      const note: Note = {
        id: localId(),
        title: meta.title,
        summary: meta.summary || null,
        body,
        pinned: partial.pinned ?? false,
        archived: partial.archived ?? false,
        trashed: false,
        markdown: partial.markdown ?? false,
        highlight: partial.highlight ?? false,
        tags: partial.tags ?? [],
        shareToken: null,
        createdAt: now,
        updatedAt: now,
      };
      setLocalNoteIds((prev) => new Set(prev).add(note.id));
      setNotes((prev) => [note, ...prev]);
      return note;
    }

    try {
      const data = await trackSync(api<{ note: Note }>("/api/notes", {
        method: "POST",
        json: {
          title: meta.title,
          summary: meta.summary,
          body,
          pinned: partial.pinned ?? false,
          archived: partial.archived ?? false,
          trashed: false,
          markdown: partial.markdown ?? false,
          highlight: partial.highlight ?? false,
          tags: partial.tags ?? [],
        },
      }));
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
    // Only regenerate title/summary when the lead line changes (or there's no
    // title yet) — avoids a model call on every keystroke-batch autosave.
    const needsMeta =
      bodyChanged &&
      patch.body !== undefined &&
      patch.title === undefined &&
      (firstLine(patch.body) !== firstLine(current?.body ?? "") ||
        !current?.title?.trim());
    let nextPatch = patch;
    if (needsMeta && patch.body !== undefined) {
      const meta = await metaForBody(patch.body);
      nextPatch = {
        ...patch,
        title: meta.title,
        ...(meta.summary ? { summary: meta.summary } : {}),
      };
    }
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...nextPatch, updatedAt: Date.now() } : n,
      ),
    );
    if (isGuest || localNoteIds.has(id)) return;

    const updated = current ? { ...current, ...nextPatch, updatedAt: Date.now() } : null;
    if (updated) cacheNote(updated).catch(() => {});

    try {
      const data = await trackSync(api<{ note: Note }>(`/api/notes/${id}`, {
        method: "PATCH",
        json: nextPatch,
      }));
      setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
      cacheNote(data.note).catch(() => {});
    } catch (e) {
      if (!navigator.onLine) {
        addPendingOp({ type: "update", noteId: id, payload: nextPatch }).catch(() => {});
      } else {
        setError(e instanceof Error ? e.message : "Failed to save");
        refresh();
      }
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
      await trackSync(api(`/api/notes/${id}`, { method: "DELETE" }));
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
        const meta = await metaForBody(note.body);
        guestNotes.push({
          id: `${localId()}${index.toString(36).toUpperCase()}`,
          title: meta.title,
          summary: meta.summary || null,
          body: note.body,
          pinned: note.pinned,
          archived: note.archived,
          trashed: false,
          markdown: false,
          highlight: false,
          tags: [],
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

  // Imports this app's own exports: a single .txt/.md, or a .zip of them
  // (one text per file). Routes through create() so guest/server + encryption
  // are handled the same as any new text.
  const importTextFiles = useCallback(
    async (file: File) => {
      const bodies: string[] = [];
      if (/\.zip$/i.test(file.name)) {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        for (const entry of Object.values(zip.files)) {
          if (!entry.dir && /\.(txt|md|markdown)$/i.test(entry.name)) {
            bodies.push(await entry.async("string"));
          }
        }
      } else if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const { extractPdfText } = await import("./pdfText");
        bodies.push(await extractPdfText(file));
      } else {
        bodies.push(await file.text());
      }
      let imported = 0;
      for (const body of bodies) {
        if (body.trim()) {
          await create({ body: body.trim() });
          imported++;
        }
      }
      return { imported };
    },
    [create],
  );

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
            highlight: note.highlight,
            tags: note.tags,
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

  // Sets a custom vanity share token. Throws on error (e.g. taken) so callers
  // can surface it inline.
  const setShareToken = useCallback(
    async (id: string, token: string) => {
      const data = await api<{ note: Note }>(`/api/notes/${id}/share`, {
        method: "PUT",
        json: { token },
      });
      setNotes((prev) => prev.map((n) => (n.id === id ? data.note : n)));
      return data.note.shareToken;
    },
    [],
  );

  return {
    notes,
    hydrated,
    isGuest,
    hasLocalNotes: localNoteIds.size > 0,
    error,
    syncStatus,
    refresh,
    create,
    update,
    remove,
    trash,
    restore,
    share,
    unshare,
    setShareToken,
    importKeepFile,
    importTextFiles,
    saveLocalNotes,
    togglePin,
    toggleArchive,
  };
}
