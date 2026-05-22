"use client";

import { Note, Tint } from "@/lib/types";
import { NoteRow } from "./NoteRow";

export function NoteList({
  notes,
  activeId,
  onOpen,
  onSelect,
  onTogglePin,
  onToggleArchive,
  onRemove,
  onSetTint,
}: {
  notes: Note[];
  activeId?: string | null;
  onOpen: (n: Note) => void;
  onSelect?: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onRemove: (id: string) => void;
  onSetTint: (id: string, t: Tint) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {notes.map((n) => (
        <NoteRow
          key={n.id}
          note={n}
          active={activeId === n.id}
          onOpen={() => onOpen(n)}
          onSelect={() => onSelect?.(n.id)}
          onTogglePin={() => onTogglePin(n.id)}
          onToggleArchive={() => onToggleArchive(n.id)}
          onRemove={() => onRemove(n.id)}
          onSetTint={(t) => onSetTint(n.id, t)}
        />
      ))}
    </ul>
  );
}

export function SectionLabel({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="mb-2 flex items-baseline gap-2 px-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </span>
      <span className="text-xs text-[var(--color-muted)]">
        {String(count).padStart(2, "0")}
      </span>
    </div>
  );
}
