"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { overlayPendingNotes } from "./pendingNotes";
import { saveNoteDraft } from "./saveNoteDraft";
import { readNoteDrafts, writeNoteDraft, replaceNoteDraft, removeNoteDraft, overlayNoteDrafts, type NoteDraft } from "./noteDrafts";
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
import {
  clearGuestNotes,
  firstNoteLine,
  isRetryableNoteError,
  localNoteId,
  metadataForBody,
  notesApi,
  NotesApiError,
  readGuestNotes,
  writeGuestNotes,
} from "./notesClient";
import { importGuestKeepFile, readImportedTextBodies } from "./noteImportClient";
import { inferNoteTitle } from "./inferTitle";

export type SyncStatus = "idle" | "syncing" | "saved" | "error" | "offline";

function sameNoteSnapshot(left: Note[], right: Note[]) {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((note) => [note.id, note]));
  if (rightById.size !== right.length) return false;
  return left.every((note) => {
    const other = rightById.get(note.id);
    return Boolean(
      other &&
        note.title === other.title &&
        note.summary === other.summary &&
        note.color === other.color &&
        note.body === other.body &&
        note.pinned === other.pinned &&
        note.archived === other.archived &&
        note.trashed === other.trashed &&
        note.markdown === other.markdown &&
        note.highlight === other.highlight &&
        note.shareToken === other.shareToken &&
        note.createdAt === other.createdAt &&
        note.updatedAt === other.updatedAt &&
        note.tags.length === other.tags.length &&
        note.tags.every((tag, index) => tag === other.tags[index]),
    );
  });
}

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
  const serverNotesRef = useRef(new Map<string, Note>());
  const submittedBodiesRef = useRef(new Map<string, Set<string>>());
  const mutationRevisionRef = useRef(new Map<string, number>());
  const saveChainsRef = useRef(new Map<string, Promise<void>>());
  const queuedNoteIdsRef = useRef(new Set<string>());
  const cacheLoadGenerationRef = useRef(0);
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

  const rememberSaved = useCallback((note: Note) => {
    if (note.updatedAt >= (serverNotesRef.current.get(note.id)?.updatedAt ?? 0)) serverNotesRef.current.set(note.id, note);
  }, []);
  const submitDraft = useCallback(async (owner: string, draft: NoteDraft, options = {}) => {
    const bodies = submittedBodiesRef.current.get(draft.note.id) ?? new Set<string>();
    bodies.add(draft.note.body);
    submittedBodiesRef.current.set(draft.note.id, bodies);
    try { return await saveNoteDraft(owner, draft, options); }
    finally { bodies.delete(draft.note.body); }
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
      const data = await notesApi<{ notes: Note[] }>("/api/notes");
      if (ownerRef.current !== ownerId) return;
      data.notes.forEach(rememberSaved);
      const pending = await getPendingOps(ownerId);
      const cached = pending.length ? await getCachedNotes(ownerId) : [];
      if (ownerRef.current !== ownerId) return;
      const drafts = readNoteDrafts(ownerId);
      data.notes = overlayNoteDrafts(overlayPendingNotes(data.notes, cached, pending), drafts);
      // Once the server answers, an older IndexedDB read must not replace it.
      cacheLoadGenerationRef.current += 1;
      try {
        await cacheNotes(ownerId, data.notes);
      } catch (cacheError) {
        console.warn("Could not refresh the offline note cache.", cacheError);
      }
      if (ownerRef.current !== ownerId) return;
      const guestNotes = readGuestNotes();
      const loaded = guestNotes.length > 0 ? [...guestNotes, ...data.notes] : data.notes;
      setLocalNoteIds(new Set(guestNotes.map((note) => note.id)));
      if (!sameNoteSnapshot(notesRef.current, loaded)) {
        notesRef.current = loaded;
        setNotes(loaded);
      }
      setError(drafts.length ? "Some changes are saved on this device and still need to sync." : null);
    } catch (e) {
      if (ownerRef.current !== ownerId) return;
      if (e instanceof NotesApiError && e.status === 401) {
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
  }, [ownerId, rememberSaved]);

  useEffect(() => {
    serverNotesRef.current.clear();
    submittedBodiesRef.current.clear();
    setHydrated(false);
    notesRef.current = [];
    setNotes([]);
    setLocalNoteIds(new Set());
    if (!ownerId) {
      void refresh();
      return;
    }
    const cacheLoadGeneration = ++cacheLoadGenerationRef.current;
    void getCachedNotes(ownerId)
      .then((cached) => {
        if (
          ownerRef.current !== ownerId ||
          cacheLoadGenerationRef.current !== cacheLoadGeneration
        ) return;
        if (cached.length > 0) {
          notesRef.current = cached;
          setNotes(cached);
          setHydrated(true);
        }
      })
      .catch(() => {});
    void refresh();
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
          const processed = new Set<string>();
          for (const op of ops) {
            if (processed.has(op.noteId) && op.type !== "delete") continue;
            try {
              await enqueueSave(op.noteId, async () => {
                if (ownerRef.current !== ownerId) throw new NotesApiError("Account changed", 401);
                const draft = readNoteDrafts(ownerId).find((entry) => entry.note.id === op.noteId);
                if (draft && op.type !== "delete") {
                  const saved = await submitDraft(ownerId, draft);
                  if (ownerRef.current === ownerId) rememberSaved(saved);
                  for (const queued of ops.filter((entry) => entry.noteId === op.noteId && entry.type !== "delete")) {
                    await removePendingOp(ownerId, queued.id);
                  }
                  processed.add(op.noteId);
                } else if (op.type === "create" && op.payload) {
                  await notesApi("/api/notes", { method: "POST", json: { ...op.payload, id: op.noteId, ownerId } });
                  const draft = readNoteDrafts(ownerId).find((entry) => entry.note.id === op.noteId);
                  if (draft) writeNoteDraft(ownerId, { ...draft, type: "update" });
                } else if (op.type === "update" && op.payload) {
                  if (op.payload.body !== undefined) throw new NotesApiError("This older offline draft needs a recovery copy.", 409);
                  const failedCreate = readNoteDrafts(ownerId).find((draft) => draft.note.id === op.noteId && draft.type === "create");
                  if (failedCreate) throw new NotesApiError("The new note needs recovery before updates can sync.", 409);
                  await notesApi(`/api/notes/${op.noteId}`, { method: "PATCH", json: op.payload });
                } else if (op.type === "delete") {
                  await notesApi(`/api/notes/${op.noteId}`, { method: "DELETE" });
                }
              });
              await removePendingOp(ownerId, op.id);
              const draft = readNoteDrafts(ownerId).find((entry) => entry.note.id === op.noteId);
              if (draft && op.payload?.body === draft.note.body &&
                  !(await getPendingOps(ownerId)).some((entry) => entry.noteId === op.noteId)) {
                removeNoteDraft(ownerId, draft);
              }
              changed = true;
            } catch (error) {
              const status = error instanceof NotesApiError ? error.status : 0;
              if (status === 401) {
                // Session expired: keep the op and stop; a refresh after
                // re-auth will retry it.
                setError("Your session expired. Sign in again to sync queued changes.");
                blocked = true;
                drained = false;
                break;
              }
              if (isRetryableNoteError(error)) {
                // Transient (network/408/429/5xx): keep the op, retry shortly.
                blocked = true;
                drained = false;
                setSyncStatus(navigator.onLine ? "error" : "offline");
                requestReplay(5_000);
                break;
              }
              let savedDraft = readNoteDrafts(ownerId).find((draft) => draft.note.id === op.noteId);
              if (!savedDraft && typeof op.payload?.body === "string") {
                const recovered = overlayPendingNotes([], notesRef.current, ops.filter((entry) => entry.noteId === op.noteId))[0];
                if (recovered) savedDraft = writeNoteDraft(ownerId, {
                  note: recovered, patch: recovered, type: op.type === "create" ? "create" : "update",
                });
              }
              if (savedDraft) setError("Some changes need attention. Retry or save a copy.");
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
        // replayPending drives ops through bare notesApi() rather than trackSync, so
        // a status left at "error"/"syncing"/"offline" by the queued-op paths
        // never clears on a clean drain. Settle it here once the queue is empty.
        if (drained && remaining.length === 0 && inflightRef.current === 0 && navigator.onLine) {
          setSyncStatus(readNoteDrafts(ownerId).length ? "error" : "idle");
        }
      } catch (error) {
        if (ownerRef.current === ownerId) {
          setError(error instanceof Error ? error.message : "Could not read queued changes.");
          setSyncStatus("error");
        }
      } finally {
        syncingRef.current = false;
      }
    }
    function onOnline() { replayPending(); }
    window.addEventListener("online", onOnline);
    if (hydrated && navigator.onLine) replayPending();
    return () => window.removeEventListener("online", onOnline);
  }, [enqueueSave, hydrated, ownerId, refresh, rememberSaved, replayTick, requestReplay, submitDraft]);

  const create = useCallback(async (
    partial: Partial<Note>,
    options: { keepalive?: boolean } = {},
  ) => {
    const body = partial.body ?? "";
    let meta = partial.title
      ? { title: partial.title, summary: partial.summary ?? "" }
      : { title: inferNoteTitle(body), summary: "" };
    const now = Date.now();
    const note: Note = {
      id: partial.id ?? localNoteId(),
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
      const next = [note, ...notesRef.current.filter((item) => item.id !== note.id)];
      notesRef.current = next;
      setNotes(next);
      return note;
    }

    if (!ownerId) return null;
    const next = [note, ...notesRef.current.filter((item) => item.id !== note.id)];
    notesRef.current = next;
    setNotes(next);
    let draft: NoteDraft;
    try { draft = writeNoteDraft(ownerId, { note, patch: note, type: "create" }); }
    catch { setError("This browser could not keep the draft. Keep this page open and copy your text."); return null; }
    cacheNote(ownerId, note).catch(() => {});

    try {
      if (!options.keepalive && !partial.title) meta = await metadataForBody(body);
      if (ownerRef.current !== ownerId) return note;
      draft = { ...draft, note: { ...draft.note, title: meta.title, summary: meta.summary || null } };
      replaceNoteDraft(ownerId, draft);
      const data = { note: await trackSync(submitDraft(ownerId, draft, options)) };
      if (ownerRef.current !== ownerId) return data.note;
      rememberSaved(data.note);
      data.note = overlayNoteDrafts([serverNotesRef.current.get(note.id) ?? data.note],
        readNoteDrafts(ownerId).filter((draft) => draft.note.id === note.id))[0];
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
      if (!readNoteDrafts(ownerId).some((draft) => draft.note.id === note.id)) {
        return notesRef.current.find((item) => item.id === note.id) ?? note;
      }
      if (isRetryableNoteError(e)) {
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
      if (ownerRef.current === ownerId) setError(e instanceof Error ? e.message : "Failed to create");
      return note;
    }
  }, [isGuest, ownerId, rememberSaved, requestReplay, submitDraft, trackSync]);

  const update = useCallback((
    id: string,
    patch: Partial<Note>,
    options: { keepalive?: boolean; base?: Note } = {},
  ): Promise<void> => {
    const current = notesRef.current.find((note) => note.id === id);
    if (!current) return Promise.resolve();
    patch = Object.fromEntries(Object.entries(patch).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(current[key as keyof Note])));
    if (!Object.keys(patch).length) return Promise.resolve();

    const bodyChanged =
      patch.body !== undefined && patch.body !== current.body;
    // Only regenerate title/summary when the lead line changes (or there's no
    // title yet) — avoids a model call on every keystroke-batch autosave.
    const needsMeta =
      bodyChanged &&
      patch.body !== undefined &&
      patch.title === undefined &&
      (firstNoteLine(patch.body) !== firstNoteLine(current.body) || !current.title.trim());
    const initialPatch =
      needsMeta && options.keepalive && patch.body !== undefined
        ? { ...patch, title: inferNoteTitle(patch.body) }
        : patch;
    const revision = (mutationRevisionRef.current.get(id) ?? 0) + 1;
    mutationRevisionRef.current.set(id, revision);
    const updatedAt = Date.now();
    const optimistic = { ...current, ...initialPatch, updatedAt };
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
      if (!needsMeta || patch.body === undefined || options.keepalive) return Promise.resolve();
      return metadataForBody(patch.body).then(applyGeneratedMeta);
    }
    if (!ownerId) return Promise.resolve();

    const previousDraft = readNoteDrafts(ownerId).find((draft) => draft.note.id === id);
    let draft: NoteDraft;
    try {
      draft = writeNoteDraft(ownerId, {
        note: optimistic, patch: { ...previousDraft?.patch, ...initialPatch },
        type: previousDraft?.type ?? "update",
        base: previousDraft ? previousDraft.base : options.base ?? serverNotesRef.current.get(id) ?? current,
        predecessors: [...new Set([...(previousDraft?.predecessors ?? []), ...(submittedBodiesRef.current.get(id) ?? [])])],
      });
    } catch {
      setError("This browser could not keep the draft. Keep this page open and copy your text.");
      return Promise.reject(new Error("Draft storage is unavailable"));
    }
    cacheNote(ownerId, optimistic).catch(() => {});

    const save = async () => {
      if (ownerRef.current !== ownerId || mutationRevisionRef.current.get(id) !== revision) return;
      let nextPatch = draft.patch;
      if (needsMeta && patch.body !== undefined && !options.keepalive) {
        const meta = await metadataForBody(patch.body);
        nextPatch = {
          ...draft.patch,
          title: meta.title,
          ...(meta.summary ? { summary: meta.summary } : {}),
        };
        applyGeneratedMeta(meta);
      }

      if (ownerRef.current !== ownerId || mutationRevisionRef.current.get(id) !== revision) return;
      // Keep the acknowledged base written by an earlier serialized save.
      const staged = readNoteDrafts(ownerId).find((entry) => entry.revision === draft.revision);
      draft = { ...(staged ?? draft), patch: nextPatch };
      replaceNoteDraft(ownerId, draft);
      const alreadyQueued =
        !options.keepalive &&
        (queuedNoteIdsRef.current.has(id) ||
          (await getPendingOps(ownerId).catch(() => [])).some((op) => op.noteId === id));
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
        const data = { note: await trackSync(submitDraft(ownerId, draft, options)) };
        if (ownerRef.current !== ownerId) return;
        rememberSaved(data.note);
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
        if (ownerRef.current !== ownerId) return;
        if (mutationRevisionRef.current.get(id) !== revision) {
          if (!readNoteDrafts(ownerId).length) setSyncStatus("idle");
          return;
        }
        if (isRetryableNoteError(error)) {
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
          // The journal keeps the optimistic text across refreshes and restarts.
        }
      }
    };
    // Exit saves must start their keepalive fetch before the page is discarded;
    // waiting behind an older promise would prevent the request from launching.
    return options.keepalive ? save() : enqueueSave(id, save);
  }, [enqueueSave, isGuest, localNoteIds, ownerId, rememberSaved, requestReplay, submitDraft, trackSync]);

  const retryDrafts = useCallback(async (copyId?: string) => {
    if (!ownerId) return;
    try {
      for (const draft of readNoteDrafts(ownerId)) {
        if (copyId && draft.note.id !== copyId) continue;
        await enqueueSave(draft.note.id, async () => {
          if (ownerRef.current !== ownerId) return;
          const queued = await getPendingOps(ownerId);
          let pending = draft;
          if (copyId === draft.note.id) {
            const note = { ...draft.note, id: localNoteId(), shareToken: null };
            pending = writeNoteDraft(ownerId, { note, patch: note, type: "create" });
            removeNoteDraft(ownerId, draft);
            for (const op of queued.filter((op) => op.noteId === draft.note.id)) await removePendingOp(ownerId, op.id);
          }
          const saved = await submitDraft(ownerId, pending);
          if (ownerRef.current === ownerId) rememberSaved(saved);
          for (const op of queued.filter((op) => op.noteId === draft.note.id)) await removePendingOp(ownerId, op.id);
        });
      }
      if (ownerRef.current === ownerId) { requestReplay(); await refresh(); }
    } catch (error) {
      if (ownerRef.current === ownerId) {
        setNotes((notes) => overlayNoteDrafts(notes, readNoteDrafts(ownerId)));
        setError(error instanceof Error ? error.message : "Failed to sync draft");
      }
    }
  }, [enqueueSave, ownerId, refresh, rememberSaved, requestReplay, submitDraft]);

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
        await trackSync(notesApi(`/api/notes/${id}`, { method: "DELETE" }));
        setError(null);
      } catch (error) {
        if (isRetryableNoteError(error)) {
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
      const { notes: guestNotes, skipped } = await importGuestKeepFile(file);
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
        skipped,
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
      const bodies = await readImportedTextBodies(file);
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
        notesApi<{ note: Note }>("/api/notes", {
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
        const data = await notesApi<{ note: Note }>(`/api/notes/${id}/share`, {
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
        const data = await notesApi<{ note: Note }>(`/api/notes/${id}/share`, {
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
      const data = await notesApi<{ note: Note }>(`/api/notes/${id}/share`, {
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
    retryDrafts,
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
