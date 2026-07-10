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
  removePendingOp,
} from "./offlineDb";

const GUEST_NOTES_KEY = "keep.guestNotes.v1";

function localId() {
  return crypto.randomUUID().replace(/-/g, "");
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
    throw new ApiRequestError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isRetryable(error: unknown) {
  return (
    !(error instanceof ApiRequestError) ||
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500
  );
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

export function useNotes(ownerId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const isGuest = ownerId === null;
  const [localNoteIds, setLocalNoteIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [replayTick, setReplayTick] = useState(0);
  const inflightRef = useRef(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = useRef<Note[]>([]);
  const mutationRevisionRef = useRef(new Map<string, number>());
  const saveChainsRef = useRef(new Map<string, Promise<void>>());
  const queuedNoteIdsRef = useRef(new Set<string>());
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!ownerId) {
      queuedNoteIdsRef.current.clear();
      return;
    }
    void getPendingOps(ownerId).then((ops) => {
      if (ownerRef.current !== ownerId) return;
      queuedNoteIdsRef.current = new Set(ops.map((op) => op.noteId));
    });
  }, [ownerId]);

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

  const requestReplay = useCallback((delayMs = 0) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    if (delayMs === 0) {
      setReplayTick((value) => value + 1);
      return;
    }
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setReplayTick((value) => value + 1);
    }, delayMs);
  }, []);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const trackSync = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    inflightRef.current++;
    setSyncStatus("syncing");
    return promise.then(
      (result) => {
        inflightRef.current--;
        if (inflightRef.current === 0) {
          setSyncStatus("saved");
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
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
  }, []);

  const enqueueSave = useCallback((id: string, task: () => Promise<void>) => {
    const previous = saveChainsRef.current.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    saveChainsRef.current.set(id, next);
    const cleanup = () => {
      if (saveChainsRef.current.get(id) === next) saveChainsRef.current.delete(id);
    };
    void next.then(cleanup, cleanup);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    if (!ownerId) {
      const guestNotes = readGuestNotes();
      setLocalNoteIds(new Set(guestNotes.map((note) => note.id)));
      notesRef.current = guestNotes;
      setNotes(guestNotes);
      setError(null);
      setHydrated(true);
      return;
    }

    try {
      const data = await api<{ notes: Note[] }>("/api/notes");
      if (ownerRef.current !== ownerId) return;
      const guestNotes = readGuestNotes();
      cacheNotes(ownerId, data.notes).catch(() => {});
      if (guestNotes.length > 0) {
        const loaded = [...guestNotes, ...data.notes];
        setLocalNoteIds(new Set(guestNotes.map((note) => note.id)));
        notesRef.current = loaded;
        setNotes(loaded);
      } else {
        setLocalNoteIds(new Set());
        notesRef.current = data.notes;
        setNotes(data.notes);
      }
      setError(null);
    } catch (e) {
      if (ownerRef.current !== ownerId) return;
      if (e instanceof ApiRequestError && e.status === 401) {
        // Session expired mid-tab: keep showing the cached synced notes (and any
        // unsynced guest notes) read-only rather than blanking the list — the
        // cache holds a full copy the user can still read until they re-auth.
        const guestNotes = readGuestNotes();
        const cached = await getCachedNotes(ownerId).catch(() => []);
        if (ownerRef.current !== ownerId) return;
        const merged = guestNotes.length > 0 ? [...guestNotes, ...cached] : cached;
        setLocalNoteIds(new Set(guestNotes.map((note) => note.id)));
        notesRef.current = merged;
        setNotes(merged);
        setError("Your session expired. Sign in again to sync changes.");
      } else {
        const cached = await getCachedNotes(ownerId).catch(() => []);
        if (ownerRef.current !== ownerId) return;
        if (cached.length > 0) {
          notesRef.current = cached;
          setNotes(cached);
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      }
    } finally {
      if (ownerRef.current === ownerId) setHydrated(true);
    }
  }, [ownerId]);

  useEffect(() => {
    setHydrated(false);
    notesRef.current = [];
    setNotes([]);
    setLocalNoteIds(new Set());
    if (!ownerId) {
      void refresh();
      return;
    }
    getCachedNotes(ownerId)
      .then((cached) => {
        if (ownerRef.current !== ownerId) return;
        if (cached.length > 0) {
          notesRef.current = cached;
          setNotes(cached);
          setHydrated(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (ownerRef.current === ownerId) void refresh();
      });
  }, [ownerId, refresh]);

  useEffect(() => {
    if (!hydrated) return;
    if (isGuest || localNoteIds.size > 0) {
      writeGuestNotes(notes.filter((note) => isGuest || localNoteIds.has(note.id)));
    }
  }, [hydrated, isGuest, localNoteIds, notes]);

  const syncingRef = useRef(false);
  useEffect(() => {
    async function replayPending() {
      if (syncingRef.current || !ownerId) return;
      syncingRef.current = true;
      let changed = false;
      let drained = true;
      try {
        while (true) {
          if (ownerRef.current !== ownerId) return;
          const ops = await getPendingOps(ownerId);
          queuedNoteIdsRef.current = new Set(ops.map((op) => op.noteId));
          if (ops.length === 0) break;

          let blocked = false;
          for (const op of ops) {
            try {
              await enqueueSave(op.noteId, async () => {
                if (op.type === "create" && op.payload) {
                  await api("/api/notes", { method: "POST", json: op.payload });
                } else if (op.type === "update" && op.payload) {
                  await api(`/api/notes/${op.noteId}`, { method: "PATCH", json: op.payload });
                } else if (op.type === "delete") {
                  await api(`/api/notes/${op.noteId}`, { method: "DELETE" });
                }
              });
              await removePendingOp(ownerId, op.id);
              changed = true;
            } catch (error) {
              const status = error instanceof ApiRequestError ? error.status : 0;
              if (status === 401) {
                // Session expired: keep the op and stop; a refresh after
                // re-auth will retry it.
                setError("Your session expired. Sign in again to sync queued changes.");
                blocked = true;
                drained = false;
                break;
              }
              if (isRetryable(error)) {
                // Transient (network/408/429/5xx): keep the op, retry shortly.
                blocked = true;
                drained = false;
                requestReplay(5_000);
                break;
              }
              // Permanent rejection (note deleted elsewhere -> 404, or a
              // 400/409/413 the server will never accept). Drop it: leaving a
              // dead op at the head of the queue would wedge every later
              // change behind it forever.
              await removePendingOp(ownerId, op.id).catch(() => {});
              changed = true;
            }
          }
          if (blocked) break;
        }
        const remaining = await getPendingOps(ownerId);
        queuedNoteIdsRef.current = new Set(remaining.map((op) => op.noteId));
        if (changed && drained && remaining.length === 0) await refresh();
        // replayPending drives ops through bare api() rather than trackSync, so
        // a status left at "error"/"syncing"/"offline" by the queued-op paths
        // never clears on a clean drain. Settle it here once the queue is empty.
        if (drained && remaining.length === 0 && inflightRef.current === 0 && navigator.onLine) {
          setSyncStatus((prev) =>
            prev === "error" || prev === "syncing" || prev === "offline" ? "idle" : prev,
          );
        }
      } finally {
        syncingRef.current = false;
      }
    }
    function onOnline() { replayPending(); }
    window.addEventListener("online", onOnline);
    if (hydrated && navigator.onLine) replayPending();
    return () => window.removeEventListener("online", onOnline);
  }, [enqueueSave, hydrated, ownerId, refresh, replayTick, requestReplay]);

  const create = useCallback(async (partial: Partial<Note>) => {
    const body = partial.body ?? "";
    const meta = partial.title
      ? { title: partial.title, summary: partial.summary ?? "" }
      : await metaForBody(body);
    const now = Date.now();
    const note: Note = {
      id: localId(),
      title: meta.title,
      summary: meta.summary || null,
      color: partial.color ?? null,
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

    if (isGuest) {
      setLocalNoteIds((prev) => new Set(prev).add(note.id));
      const next = [note, ...notesRef.current];
      notesRef.current = next;
      setNotes(next);
      return note;
    }

    if (!ownerId) return null;
    const next = [note, ...notesRef.current];
    notesRef.current = next;
    setNotes(next);
    cacheNote(ownerId, note).catch(() => {});

    try {
      const data = await trackSync(api<{ note: Note }>("/api/notes", {
        method: "POST",
        json: {
          id: note.id,
          title: meta.title,
          summary: meta.summary,
          color: note.color,
          body,
          pinned: note.pinned,
          archived: note.archived,
          trashed: false,
          markdown: note.markdown,
          highlight: note.highlight,
          tags: note.tags,
        },
      }));
      // Upsert, don't map: a refresh() fired by replay/reconnect can overwrite
      // notesRef with a server list that predates this POST, and a plain map
      // would then find no match and silently drop the note the user just made.
      const current = notesRef.current;
      const saved = current.some((item) => item.id === note.id)
        ? current.map((item) => (item.id === note.id ? data.note : item))
        : [data.note, ...current];
      notesRef.current = saved;
      setNotes(saved);
      cacheNote(ownerId, data.note).catch(() => {});
      return data.note;
    } catch (e) {
      if (isRetryable(e)) {
        await addPendingOp(ownerId, {
          type: "create",
          noteId: note.id,
          payload: note,
        })
          .then(() => {
            queuedNoteIdsRef.current.add(note.id);
            requestReplay();
          })
          .catch(() => {
            setError("The note could not be queued for sync.");
          });
        setSyncStatus(navigator.onLine ? "error" : "offline");
        return note;
      }
      setError(e instanceof Error ? e.message : "Failed to create");
      const reverted = notesRef.current.filter((item) => item.id !== note.id);
      notesRef.current = reverted;
      setNotes(reverted);
      removeCachedNote(ownerId, note.id).catch(() => {});
      return null;
    }
  }, [isGuest, ownerId, requestReplay, trackSync]);

  const update = useCallback((id: string, patch: Partial<Note>): Promise<void> => {
    const current = notesRef.current.find((note) => note.id === id);
    if (!current) return Promise.resolve();

    const bodyChanged =
      patch.body !== undefined && patch.body !== current.body;
    // Only regenerate title/summary when the lead line changes (or there's no
    // title yet) — avoids a model call on every keystroke-batch autosave.
    const needsMeta =
      bodyChanged &&
      patch.body !== undefined &&
      patch.title === undefined &&
      (firstLine(patch.body) !== firstLine(current.body) || !current.title.trim());
    const revision = (mutationRevisionRef.current.get(id) ?? 0) + 1;
    mutationRevisionRef.current.set(id, revision);
    const updatedAt = Date.now();
    const optimistic = { ...current, ...patch, updatedAt };
    const optimisticNotes = notesRef.current.map((note) =>
      note.id === id ? optimistic : note,
    );
    notesRef.current = optimisticNotes;
    setNotes(optimisticNotes);

    const applyGeneratedMeta = (generated: { title: string; summary: string }) => {
      if (mutationRevisionRef.current.get(id) !== revision) return;
      const next = notesRef.current.map((note) =>
        note.id === id
          ? {
              ...note,
              title: generated.title,
              ...(generated.summary ? { summary: generated.summary } : {}),
            }
          : note,
      );
      notesRef.current = next;
      setNotes(next);
    };

    if (isGuest || localNoteIds.has(id)) {
      if (!needsMeta || patch.body === undefined) return Promise.resolve();
      return metaForBody(patch.body).then(applyGeneratedMeta);
    }
    if (!ownerId) return Promise.resolve();

    cacheNote(ownerId, optimistic).catch(() => {});

    return enqueueSave(id, async () => {
      let nextPatch = patch;
      if (needsMeta && patch.body !== undefined) {
        const meta = await metaForBody(patch.body);
        nextPatch = {
          ...patch,
          title: meta.title,
          ...(meta.summary ? { summary: meta.summary } : {}),
        };
        applyGeneratedMeta(meta);
      }

      const alreadyQueued =
        queuedNoteIdsRef.current.has(id) ||
        (await getPendingOps(ownerId).catch(() => [])).some((op) => op.noteId === id);
      if (alreadyQueued) {
        queuedNoteIdsRef.current.add(id);
        await addPendingOp(ownerId, {
          type: "update",
          noteId: id,
          payload: nextPatch,
        })
          .then(() => requestReplay())
          .catch(() => setError("The change could not be queued for sync."));
        setSyncStatus(navigator.onLine ? "syncing" : "offline");
        return;
      }

      try {
        const data = await trackSync(api<{ note: Note }>(`/api/notes/${id}`, {
          method: "PATCH",
          json: nextPatch,
        }));
        if (mutationRevisionRef.current.get(id) === revision) {
          const next = notesRef.current.map((note) =>
            note.id === id ? data.note : note,
          );
          notesRef.current = next;
          setNotes(next);
          cacheNote(ownerId, data.note).catch(() => {});
        }
        setError(null);
      } catch (error) {
        if (isRetryable(error)) {
          await addPendingOp(ownerId, {
            type: "update",
            noteId: id,
            payload: nextPatch,
          })
            .then(() => {
              queuedNoteIdsRef.current.add(id);
              requestReplay();
            })
            .catch(() => setError("The change could not be queued for sync."));
          setSyncStatus(navigator.onLine ? "error" : "offline");
        } else {
          setError(error instanceof Error ? error.message : "Failed to save");
          if (mutationRevisionRef.current.get(id) === revision) await refresh();
        }
      }
    });
  }, [enqueueSave, isGuest, localNoteIds, ownerId, refresh, requestReplay, trackSync]);

  const trash = useCallback(async (id: string) => {
    const n = notesRef.current.find((note) => note.id === id);
    if (!n) return;
    await update(id, { trashed: true, pinned: false, archived: false });
  }, [update]);

  const restore = useCallback(async (id: string) => {
    const n = notesRef.current.find((note) => note.id === id);
    if (!n) return;
    await update(id, { trashed: false, archived: false });
  }, [update]);

  const remove = useCallback((id: string): Promise<void> => {
    const removed = notesRef.current.find((note) => note.id === id);
    if (!removed) return Promise.resolve();
    const revision = (mutationRevisionRef.current.get(id) ?? 0) + 1;
    mutationRevisionRef.current.set(id, revision);
    const next = notesRef.current.filter((note) => note.id !== id);
    notesRef.current = next;
    setNotes(next);
    if (isGuest || localNoteIds.has(id)) {
      setLocalNoteIds((ids) => {
        const remaining = new Set(ids);
        remaining.delete(id);
        return remaining;
      });
      return Promise.resolve();
    }
    if (!ownerId) return Promise.resolve();
    removeCachedNote(ownerId, id).catch(() => {});

    return enqueueSave(id, async () => {
      const alreadyQueued =
        queuedNoteIdsRef.current.has(id) ||
        (await getPendingOps(ownerId).catch(() => [])).some((op) => op.noteId === id);
      if (alreadyQueued) {
        queuedNoteIdsRef.current.add(id);
        await addPendingOp(ownerId, { type: "delete", noteId: id }).catch(() =>
          setError("The deletion could not be queued for sync."),
        );
        requestReplay();
        setSyncStatus(navigator.onLine ? "syncing" : "offline");
        return;
      }
      try {
        await trackSync(api(`/api/notes/${id}`, { method: "DELETE" }));
        setError(null);
      } catch (error) {
        if (isRetryable(error)) {
          await addPendingOp(ownerId, { type: "delete", noteId: id })
            .then(() => {
              queuedNoteIdsRef.current.add(id);
              requestReplay();
            })
            .catch(() => setError("The deletion could not be queued for sync."));
          setSyncStatus(navigator.onLine ? "error" : "offline");
        } else {
          setError(error instanceof Error ? error.message : "Failed to delete");
          if (mutationRevisionRef.current.get(id) === revision) {
            const restored = [removed, ...notesRef.current];
            notesRef.current = restored;
            setNotes(restored);
            cacheNote(ownerId, removed).catch(() => {});
          }
        }
      }
    });
  }, [enqueueSave, isGuest, localNoteIds, ownerId, requestReplay, trackSync]);

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
      for (const note of importable) {
        const meta = await metaForBody(note.body);
        guestNotes.push({
          id: localId(),
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
      const next = [...guestNotes, ...notesRef.current];
      notesRef.current = next;
      setNotes(next);
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
  // (one text per file). Routes through create() so guest/server storage is
  // handled the same as any new text.
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
    if (!ownerId) return { saved: 0 };
    const localNotes = notes.filter(
      (note) => localNoteIds.has(note.id) && !note.trashed,
    );
    if (localNotes.length === 0) return { saved: 0 };

    const imported = await Promise.all(
      localNotes.map((note) =>
        api<{ note: Note }>("/api/notes", {
          method: "POST",
          json: {
            id: note.id,
            title: note.title,
            summary: note.summary ?? null,
            color: note.color ?? null,
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
    const next = [
      ...imported.map((item) => item.note),
      ...notesRef.current.filter((note) => !localNoteIds.has(note.id)),
    ];
    notesRef.current = next;
    setNotes(next);
    cacheNotes(ownerId, next).catch(() => {});
    return { saved: imported.length };
  }, [localNoteIds, notes, ownerId]);

  const togglePin = useCallback(
    (id: string) => {
      const n = notesRef.current.find((note) => note.id === id);
      if (!n) return;
      void update(id, { pinned: !n.pinned });
    },
    [update],
  );

  const toggleArchive = useCallback(
    (id: string) => {
      const n = notesRef.current.find((note) => note.id === id);
      if (!n) return;
      const becomingArchived = !n.archived;
      void update(id, {
        archived: becomingArchived,
        pinned: becomingArchived ? false : n.pinned,
        trashed: false,
      });
    },
    [update],
  );

  const share = useCallback(
    async (id: string) => {
      if (isGuest || localNoteIds.has(id)) return null;
      try {
        const data = await api<{ note: Note }>(`/api/notes/${id}/share`, {
          method: "POST",
        });
        const next = notesRef.current.map((note) =>
          note.id === id
            ? { ...note, shareToken: data.note.shareToken, updatedAt: Math.max(note.updatedAt, data.note.updatedAt) }
            : note,
        );
        notesRef.current = next;
        setNotes(next);
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
        const next = notesRef.current.map((note) =>
          note.id === id
            ? { ...note, shareToken: data.note.shareToken, updatedAt: Math.max(note.updatedAt, data.note.updatedAt) }
            : note,
        );
        notesRef.current = next;
        setNotes(next);
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
      const next = notesRef.current.map((note) =>
        note.id === id
          ? { ...note, shareToken: data.note.shareToken, updatedAt: Math.max(note.updatedAt, data.note.updatedAt) }
          : note,
      );
      notesRef.current = next;
      setNotes(next);
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
