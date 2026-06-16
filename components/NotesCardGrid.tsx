"use client";

import { useState } from "react";
import { Note } from "@/lib/types";
import { previewText } from "@/lib/inferTitle";
import { noteFileExtension } from "@/lib/detectLanguage";
import { noteColorVar } from "@/lib/noteColors";
import { ColorSwatchRow } from "@/components/ColorSwatchRow";
import { DotsIcon, PinIcon, PinFilledIcon } from "@/components/Icons";

function bodyPreview(body: string): string {
  const text = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•]\s+(\[[ xX]\]\s+)?/, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/__(.*?)__/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/_(.*?)_/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^```.*/, "")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join(" ");
  return text.length > 260 ? text.slice(0, 260).trimEnd() + "…" : text;
}

type CardActions = {
  onOpen: (note: Note) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onColor: (id: string, color: string | null) => void;
  onInfo: (note: Note) => void;
  onRename: (id: string, title: string) => void;
};

function NoteCard({ note, actions }: { note: Note; actions: CardActions }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title = previewText(note);
  // Prefer the AI-generated description; fall back to a cleaned body preview
  // for notes that don't have one yet (guests, imports, legacy notes).
  const preview = note.summary?.trim() || bodyPreview(note.body);
  const ext = noteFileExtension(note.body);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => actions.onOpen(note)}
        className="flex h-36 w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 pr-16 text-left transition-colors hover:border-[var(--color-border-muted)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--color-text)]">
          {noteColorVar(note.color) && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: noteColorVar(note.color)! }}
              aria-hidden
            />
          )}
          <span className="truncate">{title}</span>
        </p>
        {preview && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-muted)]">
            {preview}
          </p>
        )}
        <span className="mt-auto inline-block self-start rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] lowercase text-[var(--color-subtle)]">
          .{ext}
        </span>
      </button>

      {/* Quick pin — top-right corner */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          actions.onTogglePin(note.id);
        }}
        title={note.pinned ? "Unpin" : "Pin"}
        aria-label={note.pinned ? "Unpin" : "Pin"}
        aria-pressed={note.pinned}
        className={`absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-background)] hover:text-[var(--color-text)] focus-visible:opacity-100 ${
          note.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {note.pinned ? (
          <PinFilledIcon className="h-3.5 w-3.5 text-[var(--color-text)]" />
        ) : (
          <PinIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Context menu — bottom-right corner */}
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className={`absolute bottom-2.5 right-2.5 grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-background)] hover:text-[var(--color-pink-light)] focus-visible:opacity-100 ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <DotsIcon className="h-3.5 w-3.5" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div
            role="menu"
            className="absolute bottom-11 right-2.5 z-20 w-44 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg"
          >
            <CardMenuItem
              onClick={() => {
                actions.onTogglePin(note.id);
                setMenuOpen(false);
              }}
            >
              {note.pinned ? "Unpin" : "Pin"}
            </CardMenuItem>
            <CardMenuItem
              onClick={() => {
                actions.onToggleArchive(note.id);
                setMenuOpen(false);
              }}
            >
              {note.archived ? "Unarchive" : "Archive"}
            </CardMenuItem>
            <CardMenuItem
              onClick={() => {
                const next = window.prompt("Rename text", previewText(note));
                if (next && next.trim()) actions.onRename(note.id, next.trim());
                setMenuOpen(false);
              }}
            >
              Rename
            </CardMenuItem>
            <ColorSwatchRow
              selected={note.color ?? null}
              onPick={(color) => {
                actions.onColor(note.id, color);
                setMenuOpen(false);
              }}
            />
            <div className="my-1 border-t border-[var(--color-border)]" />
            <CardMenuItem
              onClick={() => {
                actions.onInfo(note);
                setMenuOpen(false);
              }}
            >
              Get Info
            </CardMenuItem>
            <div className="my-1 border-t border-[var(--color-border)]" />
            <CardMenuItem
              danger
              onClick={() => {
                actions.onTrash(note.id);
                setMenuOpen(false);
              }}
            >
              Move to Trash
            </CardMenuItem>
          </div>
        </>
      )}
    </div>
  );
}

function CardMenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-surface-hover)] ${
        danger ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

export function NotesCardGrid({
  notes,
  onOpen,
  onTogglePin,
  onToggleArchive,
  onTrash,
  onColor,
  onInfo,
  onRename,
}: {
  notes: Note[];
} & CardActions) {
  if (notes.length === 0) return null;

  const actions: CardActions = {
    onOpen,
    onTogglePin,
    onToggleArchive,
    onTrash,
    onColor,
    onInfo,
    onRename,
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} actions={actions} />
      ))}
    </div>
  );
}
