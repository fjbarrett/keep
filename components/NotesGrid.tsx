"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useAutohideScrollbar } from "@/lib/useAutohideScrollbar";
import { Note } from "@/lib/types";
import { needsInferredTitle, previewText } from "@/lib/inferTitle";
import { noteColorVar } from "@/lib/noteColors";
import { ColorSwatchRow } from "./ColorSwatchRow";
import {
  ArchiveIcon,
  PinFilledIcon,
  PinIcon,
  TrashIcon,
  UnarchiveIcon,
} from "./Icons";

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
  const text =
    !needsInferredTitle(note.title, note.body) && firstLine !== title
      ? note.body.trim()
      : lines
          .slice(first + 1)
          .join("\n")
          .trim();
  // line-clamp handles the visible cutoff; slicing keeps a book-length note
  // from being poured into the DOM just to be hidden.
  return text.slice(0, 1200);
}

const CARD_ICON =
  "grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]";

type GridHandlers = {
  onOpen: (note: Note) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onColor: (id: string, color: string | null) => void;
};

function GridCard({
  note,
  trashMode,
  onOpen,
  onTogglePin,
  onToggleArchive,
  onTrash,
  onRestore,
  onRemove,
  onColor,
}: { note: Note; trashMode: boolean } & GridHandlers) {
  const [colorOpen, setColorOpen] = useState(false);
  const color = noteColorVar(note.color);
  const title = previewText(note);
  const snippet = snippetFor(note, title);

  // Whether the clamp actually cut the snippet off — drives the "more" hint.
  const snippetRef = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = snippetRef.current;
    if (el) setClipped(el.scrollHeight > el.clientHeight + 1);
  }, [snippet]);

  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(note);
        }
      }}
      className="group relative mb-3 block w-full cursor-pointer break-inside-avoid rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 text-left"
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
        <span
          ref={snippetRef}
          className="mt-2 line-clamp-[10] whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted)]"
        >
          {snippet}
        </span>
      )}
      {clipped && (
        <span
          aria-hidden
          className="mt-1 block text-left text-xs leading-4 text-[var(--color-subtle)]"
        >
          •&thinsp;•&thinsp;•
        </span>
      )}
      <span className="invisible mt-2 flex h-7 items-center gap-0.5 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {trashMode ? (
          <>
            <button
              type="button"
              onClick={act(() => onRestore(note.id))}
              className={CARD_ICON}
              title="Restore"
              aria-label="Restore"
            >
              <UnarchiveIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={act(() => {
                if (confirm("Permanently delete this text?")) onRemove(note.id);
              })}
              className={`${CARD_ICON} hover:text-[var(--color-danger)]`}
              title="Delete forever"
              aria-label="Delete forever"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={act(() => onTogglePin(note.id))}
              className={CARD_ICON}
              title={note.pinned ? "Unpin" : "Pin"}
              aria-label={note.pinned ? "Unpin" : "Pin"}
            >
              {note.pinned ? (
                <PinFilledIcon className="h-4 w-4" />
              ) : (
                <PinIcon className="h-4 w-4" />
              )}
            </button>
            <span className="relative">
              <button
                type="button"
                onClick={act(() => setColorOpen((v) => !v))}
                className={CARD_ICON}
                title="Color label"
                aria-label="Color label"
                aria-haspopup="menu"
                aria-expanded={colorOpen}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-[var(--color-border)]"
                  style={{ background: color ?? "transparent" }}
                />
              </button>
              {colorOpen && (
                <>
                  <span
                    className="fixed inset-0 z-10"
                    onClick={act(() => setColorOpen(false))}
                  />
                  <span
                    role="menu"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-8 left-0 z-20 block rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
                  >
                    <ColorSwatchRow
                      selected={note.color ?? null}
                      onPick={(c) => {
                        onColor(note.id, c);
                        setColorOpen(false);
                      }}
                    />
                  </span>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={act(() => onToggleArchive(note.id))}
              className={CARD_ICON}
              title={note.archived ? "Unarchive" : "Archive"}
              aria-label={note.archived ? "Unarchive" : "Archive"}
            >
              {note.archived ? (
                <UnarchiveIcon className="h-4 w-4" />
              ) : (
                <ArchiveIcon className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={act(() => onTrash(note.id))}
              className={`${CARD_ICON} hover:text-[var(--color-danger)]`}
              title="Move to Trash"
              aria-label="Move to Trash"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        )}
      </span>
    </div>
  );
}

const COLUMNS = "columns-1 gap-3 sm:columns-2 xl:columns-3";

export function NotesGrid({
  notes,
  trashMode,
  scrollMemory,
  ...handlers
}: {
  notes: Note[];
  trashMode: boolean;
  scrollMemory: React.MutableRefObject<number>;
} & GridHandlers) {
  // The grid unmounts while a note is open; restore where the user left off
  // when they come back.
  const scrollRef = useRef<HTMLDivElement>(null);
  useAutohideScrollbar(scrollRef);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollMemory.current;
  }, [scrollMemory]);

  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);
  const cards = (list: Note[]) => (
    <div className={COLUMNS}>
      {list.map((note) => (
        <GridCard
          key={note.id}
          note={note}
          trashMode={trashMode}
          {...handlers}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        scrollMemory.current = e.currentTarget.scrollTop;
      }}
      className="autohide-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
    >
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
