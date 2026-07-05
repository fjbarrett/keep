"use client";

import { Note } from "@/lib/types";
import { needsInferredTitle, previewText } from "@/lib/inferTitle";
import { noteColorVar } from "@/lib/noteColors";

// The card body skips the line the title came from — either still-uninferred
// or already materialized by useNotes — so the title isn't printed twice.
function snippetFor(note: Note, title: string) {
  const lines = note.body.split("\n");
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return "";
  const firstLine = lines[first]
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!needsInferredTitle(note.title, note.body) && firstLine !== title) {
    return note.body.trim();
  }
  return lines
    .slice(first + 1)
    .join("\n")
    .trim();
}

function GridCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const color = noteColorVar(note.color);
  const title = previewText(note);
  const snippet = snippetFor(note, title);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-3 block w-full break-inside-avoid rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:bg-[var(--color-surface-hover)]"
    >
      <span className="flex items-center gap-2">
        {color && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
        )}
        <span className="truncate text-sm font-medium text-[var(--color-text)]">
          {title}
        </span>
      </span>
      {snippet && (
        <span className="mt-2 line-clamp-[12] block whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted)]">
          {snippet}
        </span>
      )}
    </button>
  );
}

const COLUMNS = "columns-1 gap-3 sm:columns-2 xl:columns-3";

export function NotesGrid({
  notes,
  onOpen,
}: {
  notes: Note[];
  onOpen: (note: Note) => void;
}) {
  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);
  const cards = (list: Note[]) => (
    <div className={COLUMNS}>
      {list.map((note) => (
        <GridCard key={note.id} note={note} onOpen={() => onOpen(note)} />
      ))}
    </div>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <div className="mx-auto max-w-6xl">
        {pinned.length > 0 && others.length > 0 ? (
          <>
            <p className="mb-2 pl-1 text-xs font-medium text-[var(--color-muted)]">
              Pinned
            </p>
            {cards(pinned)}
            <p className="mb-2 mt-4 pl-1 text-xs font-medium text-[var(--color-muted)]">
              Others
            </p>
            {cards(others)}
          </>
        ) : (
          cards(notes)
        )}
      </div>
    </div>
  );
}
