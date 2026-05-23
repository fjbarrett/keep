"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { Note, Tint } from "@/lib/types";
import {
  ArchiveIcon,
  PinFilledIcon,
  PinIcon,
  TrashIcon,
  UnarchiveIcon,
  XIcon,
} from "./Icons";
import { TintPicker } from "./TintPicker";

export type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; note: Note }
  | null;

export function NoteEditor({
  target,
  onClose,
  onCreate,
  onUpdate,
  onTrash,
  onRestore,
  onRemove,
  presentation = "modal",
}: {
  target: EditorTarget;
  onClose: () => void;
  onCreate: (n: Partial<Note>) => void;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  presentation?: "modal" | "panel";
}) {
  const [body, setBody] = useState("");
  const [tint, setTint] = useState<Tint>("natural");
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const targetKey =
    target?.mode === "edit" ? target.note.id : target?.mode ?? "closed";
  const isPanel = presentation === "panel";

  useEffect(() => {
    if (!target) return;
    if (target.mode === "edit") {
      setBody(target.note.body);
      setTint(target.note.tint);
      setPinned(target.note.pinned);
      setArchived(target.note.archived);
    } else {
      setBody("");
      setTint("natural");
      setPinned(false);
      setArchived(false);
    }
    setDirty(false);
    setTimeout(() => {
      bodyRef.current?.focus();
    }, 30);
  }, [targetKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!target) return;
      if (e.key === "Escape") close();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, body, tint, pinned, archived]);

  useEffect(() => {
    if (!target || target.mode !== "edit" || !dirty) return;
    const timer = window.setTimeout(() => {
      onUpdate(target.note.id, { body, tint, pinned, archived });
      setDirty(false);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [archived, body, dirty, onUpdate, pinned, target, tint]);

  const displayTitle = useMemo(() => {
    if (!target || target.mode !== "edit") return "New note";
    const title = needsInferredTitle(target.note.title, body)
      ? inferNoteTitle(body || target.note.title)
      : target.note.title;
    return title || "Untitled";
  }, [body, target]);

  function markBody(value: string) {
    setBody(value);
    setDirty(true);
  }

  function markTint(value: Tint) {
    setTint(value);
    setDirty(true);
  }

  function togglePinned() {
    setPinned((value) => !value);
    setDirty(true);
  }

  function toggleArchived() {
    setArchived((value) => !value);
    setDirty(true);
  }

  function flushEdit() {
    if (!target || target.mode !== "edit") return;
    onUpdate(target.note.id, { body, tint, pinned, archived });
    setDirty(false);
  }

  function close() {
    if (!target) return;
    if (target.mode === "new") {
      if (body.trim()) {
        onCreate({ body, tint, pinned, archived });
      }
    } else {
      flushEdit();
    }
    onClose();
  }

  if (!target) return null;

  const editor = (
    <>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">
              {displayTitle}
            </p>
            {target.mode === "edit" && (
              <p className="font-mono text-[10px] text-[var(--color-muted)]">
                {dirty ? "Saving..." : `#${target.note.id.slice(-6)}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {target.mode !== "edit" || !target.note.trashed ? (
              <button
                type="button"
                onClick={togglePinned}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
                  pinned
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-muted)]"
                }`}
                title={pinned ? "Unpin" : "Pin"}
              >
                {pinned ? (
                  <PinFilledIcon className="h-3.5 w-3.5" />
                ) : (
                  <PinIcon className="h-3.5 w-3.5" />
                )}
                {pinned ? "Pinned" : "Pin"}
              </button>
            ) : null}
            {!isPanel && (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-ring"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 px-4 py-4">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => markBody(e.target.value)}
            placeholder="Start writing..."
            rows={Math.max(6, Math.min(20, body.split("\n").length + 2))}
            className="min-h-[320px] w-full flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5">
          {target.mode !== "edit" || !target.note.trashed ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)]">Tint</span>
              <TintPicker value={tint} onChange={markTint} />
            </div>
          ) : (
            <span className="text-xs text-[var(--color-muted)]">
              In Trash
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {target.mode === "edit" && target.note.trashed && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    flushEdit();
                    onRestore(target.note.id);
                    if (!isPanel) onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  <UnarchiveIcon className="h-3.5 w-3.5" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Permanently delete this note?")) {
                      onRemove(target.note.id);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete forever
                </button>
              </>
            )}
            {target.mode === "edit" && !target.note.trashed && (
              <>
                <button
                  type="button"
                  onClick={toggleArchived}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
                  title={archived ? "Unarchive" : "Archive"}
                >
                  {archived ? (
                    <UnarchiveIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ArchiveIcon className="h-3.5 w-3.5" />
                  )}
                  {archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    flushEdit();
                    onTrash(target.note.id);
                    if (!isPanel) onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Move to Trash
                </button>
              </>
            )}
            {target.mode === "new" && (
              <button
                type="button"
                onClick={close}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                Create
              </button>
              )}
          </div>
        </div>
    </>
  );

  if (presentation === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        {editor}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {editor}
      </div>
    </div>
  );
}
