"use client";

import { Note } from "@/lib/types";
import { previewText } from "@/lib/inferTitle";
import { noteColorVar } from "@/lib/noteColors";
import { PinIcon, PinFilledIcon } from "@/components/Icons";

function relativeDate(ts: number): string {
  const now = Date.now();
  const diffMs = now - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(diffDays / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

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

function NoteCard({
  note,
  onOpen,
  onTogglePin,
}: {
  note: Note;
  onOpen: (note: Note) => void;
  onTogglePin: (id: string) => void;
}) {
  const title = previewText(note);
  // Prefer the AI-generated description; fall back to a cleaned body preview
  // for notes that don't have one yet (guests, imports, legacy notes).
  const preview = note.summary?.trim() || bodyPreview(note.body);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onOpen(note)}
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 pr-10 text-left transition-colors hover:border-[var(--color-border-muted)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
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
          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-[var(--color-muted)]">
            {preview}
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--color-subtle)]">
          {relativeDate(note.updatedAt)}
        </p>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(note.id);
        }}
        title={note.pinned ? "Unpin" : "Pin"}
        aria-label={note.pinned ? "Unpin" : "Pin"}
        aria-pressed={note.pinned}
        className={`absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:opacity-100 ${
          note.pinned
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {note.pinned ? (
          <PinFilledIcon className="h-3.5 w-3.5 text-[var(--color-text)]" />
        ) : (
          <PinIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function NotesCardGrid({
  notes,
  onOpen,
  onTogglePin,
}: {
  notes: Note[];
  onOpen: (note: Note) => void;
  onTogglePin: (id: string) => void;
}) {
  if (notes.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onOpen={onOpen}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}
