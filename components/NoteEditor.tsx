"use client";

import { useEffect, useRef, useState } from "react";
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
  onRemove,
}: {
  target: EditorTarget;
  onClose: () => void;
  onCreate: (n: Partial<Note>) => void;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onRemove: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const [tint, setTint] = useState<Tint>("natural");
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!target) return;
    if (target.mode === "edit") {
      setBody(target.note.body || target.note.title);
      setTint(target.note.tint);
      setPinned(target.note.pinned);
      setArchived(target.note.archived);
    } else {
      setBody("");
      setTint("natural");
      setPinned(false);
      setArchived(false);
    }
    setTimeout(() => {
      bodyRef.current?.focus();
    }, 30);
  }, [target]);

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

  function close() {
    if (!target) return;
    if (target.mode === "new") {
      if (body.trim()) {
        onCreate({ body, tint, pinned, archived });
      }
    } else {
      onUpdate(target.note.id, { body, tint, pinned, archived });
    }
    onClose();
  }

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {target.mode === "new" ? "New note" : "Note"}
            </span>
            {target.mode === "edit" && (
              <span className="font-mono text-xs text-[var(--color-muted)]">
                {target.note.id.slice(-6)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
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
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-ring"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start writing…"
            rows={Math.max(6, Math.min(20, body.split("\n").length + 2))}
            className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-muted)]">Tint</span>
            <TintPicker value={tint} onChange={setTint} />
          </div>

          <div className="flex items-center gap-1.5">
            {target.mode === "edit" && (
              <>
                <button
                  type="button"
                  onClick={() => setArchived((v) => !v)}
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
                    if (confirm("Delete this note for good?")) {
                      onRemove(target.note.id);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              onClick={close}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              {target.mode === "new" ? "Create" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
