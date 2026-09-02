"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

type GridDensity = "compact" | "comfortable";

const GRID_DENSITY_KEY = "keep.gridDensity";

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
  active,
  density,
  trashMode,
  onOpen,
  onTogglePin,
  onToggleArchive,
  onTrash,
  onRestore,
  onRemove,
  onColor,
}: {
  note: Note;
  active: boolean;
  density: GridDensity;
  trashMode: boolean;
} & GridHandlers) {
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
  }, [density, snippet]);

  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <article
      className={`note-card group relative block w-full break-inside-avoid rounded-lg border text-left transition-[border-color,background-color,box-shadow] ${
        density === "compact" ? "mb-2.5 p-3.5" : "mb-3 p-4"
      } ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-canvas)] shadow-[inset_3px_0_0_var(--color-accent)]"
          : "border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(note)}
        aria-current={active ? "true" : undefined}
        aria-label={`Open ${title}`}
        className="block w-full cursor-pointer text-left"
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
            className={`mt-2 whitespace-pre-wrap break-words text-sm text-[var(--color-muted)] ${
              density === "compact"
                ? "line-clamp-4 leading-5"
                : "line-clamp-[7] leading-6"
            }`}
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
      </button>
      <span className="note-card-actions mt-2 flex h-8 items-center justify-end gap-0.5 border-t border-[var(--color-border-muted)] pt-1">
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
    </article>
  );
}

const COLUMNS = "columns-1 sm:columns-2 xl:columns-3";

export function NotesGrid({
  notes,
  activeNoteId,
  viewMode,
  trashMode,
  scrollMemory,
  ...handlers
}: {
  notes: Note[];
  activeNoteId: string | null;
  viewMode: "active" | "archive" | "trash";
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

  const [density, setDensity] = useState<GridDensity>("compact");
  useEffect(() => {
    const stored = localStorage.getItem(GRID_DENSITY_KEY);
    if (stored === "compact" || stored === "comfortable") setDensity(stored);
  }, []);

  function chooseDensity(next: GridDensity) {
    setDensity(next);
    localStorage.setItem(GRID_DENSITY_KEY, next);
  }

  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);
  const cards = (list: Note[]) => (
    <div className={COLUMNS}>
      {list.map((note) => (
        <GridCard
          key={note.id}
          note={note}
          active={note.id === activeNoteId}
          density={density}
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
      className="autohide-scrollbar min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)] px-3 pb-3"
    >
      <div className="mx-auto max-w-6xl">
        <header className="sticky top-0 z-20 mb-3 flex min-h-14 items-center justify-between gap-4 border-b border-[var(--color-border-muted)] bg-[var(--color-background)]/95 py-2 backdrop-blur-sm">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-sm font-semibold text-[var(--color-text)]">
              {viewMode === "archive"
                ? "Archive"
                : viewMode === "trash"
                  ? "Trash"
                  : "Texts"}
            </h2>
            <span className="shrink-0 text-xs tabular-nums text-[var(--color-subtle)]">
              {notes.length}
            </span>
          </div>
          <div
            role="group"
            aria-label="Card density"
            className="flex shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-canvas)] p-0.5"
          >
            {(["compact", "comfortable"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => chooseDensity(option)}
                aria-pressed={density === option}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  density === option
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {option === "compact" ? "Compact" : "Comfortable"}
              </button>
            ))}
          </div>
        </header>
        {pinned.length > 0 && others.length > 0 ? (
          <>
            <div className="mb-2 flex items-center gap-2 px-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                Pinned
              </p>
              <span className="h-px flex-1 bg-[var(--color-border-muted)]" />
            </div>
            {cards(pinned)}
            <div className="mb-2 mt-4 flex items-center gap-2 px-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">
                Others
              </p>
              <span className="h-px flex-1 bg-[var(--color-border-muted)]" />
            </div>
            {cards(others)}
          </>
        ) : (
          cards(notes)
        )}
      </div>
    </div>
  );
}
