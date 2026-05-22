"use client";

import { useEffect, useRef, useState } from "react";
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

function formatDate(t: number): string {
  const d = new Date(t);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function notePreview(note: Note): string {
  const trimmed = (note.title || note.body).replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : "(empty)";
}

export function NoteRow({
  note,
  active,
  onOpen,
  onSelect,
  onTogglePin,
  onToggleArchive,
  onRemove,
  onSetTint,
}: {
  note: Note;
  active?: boolean;
  onOpen: () => void;
  onSelect?: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onRemove: () => void;
  onSetTint: (t: Tint) => void;
}) {
  const [showPalette, setShowPalette] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <li
      ref={rowRef}
      className={`group relative flex items-center justify-between gap-4 px-4 py-3 first:rounded-t-[7px] last:rounded-b-[7px] ${
        active ? "bg-[var(--color-surface-hover)]" : "hover:bg-[var(--color-surface-hover)]"
      }`}
      onMouseEnter={onSelect}
    >
      <button
        onClick={onOpen}
        onFocus={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-ring"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: TINT_HEX_SOLID[note.tint] }}
          title={note.tint}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--color-text)]">
            {notePreview(note)}
          </span>
          {note.pinned && (
            <PinFilledIcon className="h-3 w-3 shrink-0 text-[var(--color-muted)]" />
          )}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--color-muted)]">
        <span className="hidden font-mono sm:inline">
          {formatDate(note.updatedAt)}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
                  className="absolute right-0 top-full z-20 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-sm"
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
            label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this note for good?")) onRemove();
            }}
            danger
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
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
