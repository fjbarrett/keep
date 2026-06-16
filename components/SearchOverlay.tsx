"use client";

import { previewText } from "@/lib/inferTitle";
import { Note } from "@/lib/types";
import { SearchIcon } from "@/components/Icons";

export function SearchOverlay({
  query,
  setQuery,
  searchRef,
  results,
  activeId,
  setActiveId,
  onOpen,
  onClose,
}: {
  query: string;
  setQuery: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  results: Note[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  onOpen: (note: Note) => void;
  onClose: () => void;
}) {
  const hasQuery = query.trim().length > 0;

  return (
    <div data-search-overlay role="dialog" aria-label="Search texts" className="fixed inset-0 z-40 px-4 pt-[14vh]">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <SearchIcon className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search texts"
            placeholder="Search texts..."
            className="min-w-0 flex-1 border-0 bg-transparent text-lg text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            <div className="flex flex-col gap-1">
              {results.map((note) => {
                const active = note.id === activeId;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onMouseEnter={() => setActiveId(note.id)}
                    onClick={() => onOpen(note)}
                    className={`flex items-center justify-between gap-4 rounded-md px-3 py-2 text-left ${
                      active
                        ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      <HighlightMatch text={previewText(note)} query={query} />
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)]">
                      {new Date(note.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-[var(--color-text)]">
                {hasQuery ? "No texts found" : "Start typing to search"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[rgba(217,121,22,0.35)] px-0.5 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
