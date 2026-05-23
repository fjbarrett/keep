"use client";

import { useEffect, useRef, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { Note, Tint } from "@/lib/types";
import { TINT_HEX_SOLID, TintPicker } from "./TintPicker";
import {
  ArchiveIcon,
  PaletteIcon,
  PinFilledIcon,
  PinIcon,
  TrashIcon,
  UnarchiveIcon,
} from "./Icons";

function relativeTime(t: number): string {
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diff > 86400 * 365 ? "numeric" : undefined,
  });
}

function noteTitle(note: Note): string {
  const title = needsInferredTitle(note.title, note.body)
    ? inferNoteTitle(note.body || note.title)
    : note.title;
  const trimmed = title.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : "Untitled";
}

function notePreview(note: Note): string {
  const body = note.body.replace(/\s+/g, " ").trim();
  if (!body) return "";
  const title = noteTitle(note);
  if (body.startsWith(title)) {
    return body.slice(title.length).trim();
  }
  return body;
}

export function NoteRow({
  note,
  active,
  onOpen,
  onSelect,
  onTogglePin,
  onToggleArchive,
  onRemove,
  onRestore,
  onDestroy,
  onSetTint,
  trashMode = false,
}: {
  note: Note;
  active?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onDestroy: () => void;
  onSetTint: (t: Tint) => void;
  trashMode?: boolean;
}) {
  const [showPalette, setShowPalette] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const preview = notePreview(note);

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <li
      ref={rowRef}
      className={`group relative flex gap-3 border-t border-[var(--color-border-muted)] px-4 py-3 first:border-t-0 ${
        active ? "bg-[var(--color-surface-hover)]" : "hover:bg-[var(--color-surface-hover)]"
      }`}
      onMouseEnter={onSelect}
    >
      <span
        aria-hidden
        className="mt-1 h-8 w-8 shrink-0 rounded-full border border-[var(--color-border)]"
        style={{ background: TINT_HEX_SOLID[note.tint] }}
        title={note.tint}
      />

      <button
        onClick={onOpen}
        onFocus={onSelect}
        className="min-w-0 flex-1 text-left focus-ring"
      >
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-link)] hover:underline">
            {noteTitle(note)}
          </span>
          {note.pinned && (
            <PinFilledIcon className="h-3 w-3 shrink-0 text-[var(--color-attention)]" />
          )}
        </div>
        {preview && (
          <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-muted)]">
            {preview}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Updated {relativeTime(note.updatedAt)}
        </p>
      </button>

      <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {trashMode ? (
          <>
            <IconBtn
              label="Restore"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
            >
              <UnarchiveIcon className="h-3.5 w-3.5" />
            </IconBtn>

            <IconBtn
              label="Delete forever"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Permanently delete this note?")) onDestroy();
              }}
              danger
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </IconBtn>
          </>
        ) : (
          <>
            <IconBtn
              label={note.pinned ? "Unpin" : "Pin"}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
            >
              {note.pinned ? (
                <PinFilledIcon className="h-3.5 w-3.5" />
              ) : (
                <PinIcon className="h-3.5 w-3.5" />
              )}
            </IconBtn>

            <div className="relative">
              <IconBtn
                label="Color"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPalette((v) => !v);
                }}
                active={showPalette}
              >
                <PaletteIcon className="h-3.5 w-3.5" />
              </IconBtn>
              {showPalette && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPalette(false);
                    }}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full z-20 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-lg"
                  >
                    <TintPicker
                      value={note.tint}
                      onChange={(t) => {
                        onSetTint(t);
                        setShowPalette(false);
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <IconBtn
              label={note.archived ? "Unarchive" : "Archive"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleArchive();
              }}
            >
              {note.archived ? (
                <UnarchiveIcon className="h-3.5 w-3.5" />
              ) : (
                <ArchiveIcon className="h-3.5 w-3.5" />
              )}
            </IconBtn>

            <IconBtn
              label="Move to Trash"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              danger
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </IconBtn>
          </>
        )}
      </div>
    </li>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-[var(--color-surface)] ${
        active ? "text-[var(--color-text)] bg-[var(--color-surface)]" : ""
      } ${
        danger
          ? "text-[var(--color-muted)] hover:text-[var(--color-danger)]"
          : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}
