"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "@/lib/useNotes";
import { Note, View } from "@/lib/types";
import { NoteList, SectionLabel } from "@/components/NoteList";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { EmptyState } from "@/components/EmptyState";
import {
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "@/components/Icons";

const VIEW_TITLES: Record<View, string> = {
  all: "Your notes",
  pinned: "Pinned",
  archive: "Archive",
};

function searchableText(note: { body: string; title: string }) {
  return note.body.trim() || note.title.trim();
}

function previewText(note: Note) {
  const text = searchableText(note).replace(/\s+/g, " ").trim();
  return text || "(empty)";
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
    isGuest,
    error,
    refresh,
    create,
    update,
    remove,
    importKeepFile,
    togglePin,
    toggleArchive,
    setTint,
  } = useNotes();

  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [target, setTarget] = useState<EditorTarget>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(
    () => ({
      all: notes.filter((n) => !n.archived).length,
      pinned: notes.filter((n) => n.pinned && !n.archived).length,
      archive: notes.filter((n) => n.archived).length,
    }),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = searchOpen ? query.trim().toLowerCase() : "";
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
  }, [notes, view, query, searchOpen]);

  const pinned = view === "all" ? filtered.filter((n) => n.pinned) : [];
  const others = view === "all" ? filtered.filter((n) => !n.pinned) : filtered;
  const visibleNotes = useMemo(
    () => (view === "all" ? [...pinned, ...others] : filtered),
    [filtered, others, pinned, view],
  );
  const activeNote =
    visibleNotes.find((note) => note.id === activeNoteId) ?? null;

  function openSearch() {
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    searchRef.current?.blur();
  }

  function openNote(note: Note | null) {
    if (!note) return;
    setSearchOpen(false);
    setQuery("");
    setTarget({ mode: "edit", note });
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      await importKeepFile(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleGuestExport() {
    if (notes.length === 0) return;
    if (notes.length === 1) {
      downloadBlob(noteFileName(notes[0]), noteFileContent(notes[0]), "text/plain");
      return;
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const note of notes) {
      zip.file(noteFileName(note), noteFileContent(note));
    }
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob("keep-notes.zip", content, "application/zip");
  }

  useEffect(() => {
    if (!searchOpen) return;
    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    }, 20);
    return () => window.clearTimeout(focusTimer);
  }, [searchOpen]);

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

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const typing = isEditableElement(event.target);
      const searchFocused = event.target === searchRef.current;

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openSearch();
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
          closeSearch();
        }
        return;
      }

      if (event.key === "/" || key === "f") {
        event.preventDefault();
        openSearch();
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
        {isGuest && notes.length > 0 && <GuestSaveBanner />}

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
                ref={importRef}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                onChange={handleImport}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:opacity-60"
              >
                <UploadIcon className="h-4 w-4" />
                {importing ? "Importing" : "Import"}
              </button>
              {notes.length > 0 && isGuest ? (
                <button
                  type="button"
                  onClick={handleGuestExport}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Export
                </button>
              ) : notes.length > 0 ? (
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

      {searchOpen && (
        <SearchOverlay
          query={query}
          setQuery={setQuery}
          searchRef={searchRef}
          results={visibleNotes}
          activeId={activeNoteId}
          setActiveId={setActiveNoteId}
          onOpen={openNote}
          onClose={closeSearch}
        />
      )}
    </>
  );
}

function downloadBlob(fileName: string, content: BlobPart, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function noteText(note: Note) {
  return note.body.trim() || note.title.trim();
}

function noteFileName(note: Note) {
  const base =
    noteText(note)
      .split("\n")[0]
      ?.replace(/\s+/g, " ")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .trim()
      .slice(0, 60) || "note";
  return `${base}-${note.id.slice(-6)}.txt`;
}

function noteFileContent(note: Note) {
  return `${noteText(note)}\n`;
}

function GuestSaveBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-sm text-[var(--color-muted)]">
        These notes are saved only in this browser.
      </p>
      <a
        href="/signin?from=/"
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
      >
        Sign in to save
      </a>
    </div>
  );
}

function SearchOverlay({
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
    <div className="fixed inset-0 z-40 px-4 pt-[14vh]">
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
            placeholder="Search notes..."
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
                      {previewText(note)}
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
                {hasQuery ? "No notes found" : "Start typing to search"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
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
