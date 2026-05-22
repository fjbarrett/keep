"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "@/lib/useNotes";
import { Note, View } from "@/lib/types";
import { NoteList, SectionLabel } from "@/components/NoteList";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { EmptyState } from "@/components/EmptyState";
import { DownloadIcon, PlusIcon } from "@/components/Icons";

const VIEW_TITLES: Record<View, string> = {
  all: "Your notes",
  pinned: "Pinned",
  archive: "Archive",
};

function searchableText(note: { body: string; title: string }) {
  return note.body.trim() || note.title.trim();
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function NotesView() {
  const {
    notes,
    hydrated,
    error,
    refresh,
    create,
    update,
    remove,
    togglePin,
    toggleArchive,
    setTint,
  } = useNotes();

  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<EditorTarget>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(
    () => ({
      all: notes.filter((n) => !n.archived).length,
      pinned: notes.filter((n) => n.pinned && !n.archived).length,
      archive: notes.filter((n) => n.archived).length,
    }),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (view === "archive") return n.archived;
        if (view === "pinned") return n.pinned && !n.archived;
        return !n.archived;
      })
      .filter((n) => {
        if (!q) return true;
        return searchableText(n).toLowerCase().includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, view, query]);

  const pinned = view === "all" ? filtered.filter((n) => n.pinned) : [];
  const others = view === "all" ? filtered.filter((n) => !n.pinned) : filtered;
  const visibleNotes = useMemo(
    () => (view === "all" ? [...pinned, ...others] : filtered),
    [filtered, others, pinned, view],
  );
  const activeNote =
    visibleNotes.find((note) => note.id === activeNoteId) ?? null;

  useEffect(() => {
    if (visibleNotes.length === 0) {
      setActiveNoteId(null);
      return;
    }
    if (!activeNoteId || !visibleNotes.some((note) => note.id === activeNoteId)) {
      setActiveNoteId(visibleNotes[0].id);
    }
  }, [activeNoteId, visibleNotes]);

  useEffect(() => {
    function selectByOffset(offset: number) {
      if (visibleNotes.length === 0) return;
      const currentIndex = Math.max(
        0,
        visibleNotes.findIndex((note) => note.id === activeNoteId),
      );
      const nextIndex =
        (currentIndex + offset + visibleNotes.length) % visibleNotes.length;
      setActiveNoteId(visibleNotes[nextIndex].id);
    }

    function openNote(note: Note | null) {
      if (note) setTarget({ mode: "edit", note });
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const typing = isEditableElement(event.target);
      const searchFocused = event.target === searchRef.current;

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (typing || target) {
        if (searchFocused && (event.key === "ArrowDown" || key === "j")) {
          event.preventDefault();
          selectByOffset(1);
          return;
        }

        if (searchFocused && (event.key === "ArrowUp" || key === "k")) {
          event.preventDefault();
          selectByOffset(-1);
          return;
        }

        if (searchFocused && (event.key === "Enter" || key === "o")) {
          event.preventDefault();
          openNote(activeNote ?? visibleNotes[0] ?? null);
          return;
        }

        if (event.key === "Escape" && searchFocused) {
          setQuery("");
          searchRef.current?.blur();
        }
        return;
      }

      if (event.key === "/" || key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (key === "n" || key === "c") {
        event.preventDefault();
        setTarget({ mode: "new" });
        return;
      }

      if (event.key === "1") {
        setView("all");
        return;
      }
      if (event.key === "2") {
        setView("pinned");
        return;
      }
      if (event.key === "3") {
        setView("archive");
        return;
      }

      if (event.key === "ArrowDown" || key === "j") {
        event.preventDefault();
        selectByOffset(1);
        return;
      }
      if (event.key === "ArrowUp" || key === "k") {
        event.preventDefault();
        selectByOffset(-1);
        return;
      }

      if (event.key === "Enter" || key === "o") {
        event.preventDefault();
        openNote(activeNote);
        return;
      }

      if (key === "p" && activeNote) {
        event.preventDefault();
        togglePin(activeNote.id);
        return;
      }

      if (key === "a" && activeNote) {
        event.preventDefault();
        toggleArchive(activeNote.id);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && activeNote) {
        event.preventDefault();
        if (confirm("Delete this note for good?")) remove(activeNote.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeNote, activeNoteId, remove, target, toggleArchive, togglePin, visibleNotes]);

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {error && <DbError error={error} onRetry={refresh} />}

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
                {VIEW_TITLES[view]}
              </h1>
              <p className="text-sm text-[var(--color-muted)]">
                {hydrated
                  ? `${filtered.length} ${filtered.length === 1 ? "note" : "notes"}`
                  : "loading…"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes…"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] shadow-sm focus:border-[var(--color-text)] focus:outline-none"
              />
              {notes.length > 0 ? (
                <a
                  href="/api/notes/export"
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Export
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex cursor-not-allowed items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] opacity-60"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Export
                </button>
              )}
              <button
                type="button"
                onClick={() => setTarget({ mode: "new" })}
                className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
              >
                <PlusIcon className="h-4 w-4" />
                New note
              </button>
            </div>
          </div>

          <ViewTabs view={view} setView={setView} counts={counts} />

          {!hydrated ? null : filtered.length === 0 ? (
            query ? (
              <NoResults query={query} />
            ) : (
              <EmptyState view={view} />
            )
          ) : (
            <div className="flex flex-col gap-6">
              {view === "all" && pinned.length > 0 && (
                <section>
                  <SectionLabel label="Pinned" count={pinned.length} />
                  <NoteList
                    notes={pinned}
                    activeId={activeNoteId}
                    onOpen={(n) => setTarget({ mode: "edit", note: n })}
                    onSelect={setActiveNoteId}
                    onTogglePin={togglePin}
                    onToggleArchive={toggleArchive}
                    onRemove={remove}
                    onSetTint={setTint}
                  />
                </section>
              )}

              <section>
                {view === "all" && pinned.length > 0 && others.length > 0 && (
                  <SectionLabel label="Others" count={others.length} />
                )}
                <NoteList
                  notes={others}
                  activeId={activeNoteId}
                  onOpen={(n) => setTarget({ mode: "edit", note: n })}
                  onSelect={setActiveNoteId}
                  onTogglePin={togglePin}
                  onToggleArchive={toggleArchive}
                  onRemove={remove}
                  onSetTint={setTint}
                />
              </section>
            </div>
          )}
        </div>
      </main>

      <NoteEditor
        target={target}
        onClose={() => setTarget(null)}
        onCreate={create}
        onUpdate={update}
        onRemove={remove}
      />
    </>
  );
}

function ViewTabs({
  view,
  setView,
  counts,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { all: number; pinned: number; archive: number };
}) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pinned", label: "Pinned", count: counts.pinned },
    { key: "archive", label: "Archive", count: counts.archive },
  ];
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1 self-start">
      {tabs.map((t) => {
        const active = view === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-[var(--color-background)] text-[var(--color-text)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {t.label}
            <span
              className={`font-mono text-[10px] ${
                active ? "text-[var(--color-muted)]" : "text-[var(--color-muted)]"
              }`}
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] px-6 py-16 text-center">
      <p className="text-sm font-medium text-[var(--color-text)]">
        No notes match "{query}"
      </p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Try a different search term.
      </p>
    </div>
  );
}

function DbError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">
          Couldn't reach Postgres
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted)]">
          {error}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      >
        Retry
      </button>
    </div>
  );
}
