"use client";

import { Note } from "@/lib/types";
import { previewText } from "@/lib/inferTitle";
import { PinIcon } from "@/components/Icons";

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
  return body
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
    .slice(0, 3)
    .join(" · ");
}

function NoteCard({
  note,
  onOpen,
}: {
  note: Note;
  onOpen: (note: Note) => void;
}) {
  const title = previewText(note);
  const preview = bodyPreview(note.body);

  return (
    <button
      type="button"
      onClick={() => onOpen(note)}
      className="group w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:border-[var(--color-border-muted)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">
          {title}
        </p>
        {note.pinned && (
          <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" />
        )}
      </div>
      {preview && (
        <p className="mt-1.5 line-clamp-2 text-xs text-[var(--color-muted)]">
          {preview}
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--color-subtle)]">
        {relativeDate(note.updatedAt)}
      </p>
    </button>
  );
}

export function NotesCardGrid({
  notes,
  onOpen,
}: {
  notes: Note[];
  onOpen: (note: Note) => void;
}) {
  if (notes.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-3">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} onOpen={onOpen} />
      ))}
    </div>
  );
}
