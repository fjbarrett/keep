"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { useNotes } from "@/lib/useNotes";
import { Note, View } from "@/lib/types";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { TINT_HEX_SOLID, TintPicker } from "@/components/TintPicker";
import {
  DownloadIcon,
  PinFilledIcon,
  SearchIcon,
  SettingsIcon,
  UploadIcon,
  XIcon,
} from "@/components/Icons";

const VIEW_TITLES: Record<View, string> = {
  all: "Your notes",
  pinned: "Pinned",
  archive: "Archive",
  trash: "Trash",
};

function searchableText(note: { body: string; title: string }) {
  return note.body.trim() || note.title.trim();
}

function previewText(note: Note) {
  const title = needsInferredTitle(note.title, note.body)
    ? inferNoteTitle(searchableText(note))
    : note.title;
  const text = title.replace(/\s+/g, " ").trim();
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
    hasLocalNotes,
    error,
    refresh,
    create,
    update,
    remove,
    trash,
    restore,
    importKeepFile,
    saveLocalNotes,
    togglePin,
    toggleArchive,
    setTint,
  } = useNotes();

  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [target, setTarget] = useState<EditorTarget>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(
    () => ({
      all: notes.filter((n) => !n.archived && !n.trashed).length,
      pinned: notes.filter((n) => n.pinned && !n.archived && !n.trashed).length,
      archive: notes.filter((n) => n.archived && !n.trashed).length,
      trash: notes.filter((n) => n.trashed).length,
    }),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = searchOpen ? query.trim().toLowerCase() : "";
    return notes
      .filter((n) => {
        if (view === "trash") return n.trashed;
        if (view === "archive") return n.archived;
        if (view === "pinned") return n.pinned && !n.archived && !n.trashed;
        return !n.archived && !n.trashed;
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
  const editorTarget: EditorTarget = target;

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
    setActiveNoteId(note.id);
    setTarget({ mode: "edit", note });
  }

  async function handleCreate(partial: Partial<Note>) {
    const note = await create(partial);
    if (note) {
      setView(note.trashed ? "trash" : note.archived ? "archive" : "all");
      setActiveNoteId(note.id);
    }
    return note ?? null;
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
    const exportable = notes.filter((note) => !note.trashed);
    if (exportable.length === 0) return;
    if (exportable.length === 1) {
      downloadBlob(noteFileName(exportable[0]), noteFileContent(exportable[0]), "text/plain");
      return;
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const note of exportable) {
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
        if (searchFocused && event.key === "ArrowDown") {
          event.preventDefault();
          selectByOffset(1);
          return;
        }

        if (searchFocused && event.key === "ArrowUp") {
          event.preventDefault();
          selectByOffset(-1);
          return;
        }

        if (searchFocused && event.key === "Enter") {
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
      if (event.key === "4") {
        setView("trash");
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
        if (view === "trash") {
          if (confirm("Permanently delete this note?")) remove(activeNote.id);
        } else {
          trash(activeNote.id);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeNote, activeNoteId, remove, target, toggleArchive, togglePin, trash, view, visibleNotes]);

  const mainTarget: EditorTarget = target;

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <Sidebar
          view={view}
          setView={setView}
          counts={counts}
          hydrated={hydrated}
          filtered={filtered}
          activeNoteId={activeNoteId}
          onOpenNote={openNote}
          onNewNote={() => {
            setActiveNoteId(null);
            setTarget({ mode: "new" });
          }}
          onOpenSearch={openSearch}
          onOpenSettings={() => setSettingsOpen(true)}
          togglePin={togglePin}
          toggleArchive={toggleArchive}
          trash={trash}
          restore={restore}
          remove={remove}
          setTint={setTint}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
          {error && (
            <div className="px-6 pt-4">
              <DbError error={error} onRetry={refresh} />
            </div>
          )}
          {(isGuest || hasLocalNotes) && notes.length > 0 && (
            <div className="px-6 pt-4">
              <GuestSaveBanner
                isGuest={isGuest}
                hasLocalNotes={hasLocalNotes}
                onSave={saveLocalNotes}
              />
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col p-6">
            {mainTarget ? (
              <NoteEditor
                target={mainTarget}
                onClose={() => {
                  setTarget(null);
                  setActiveNoteId(null);
                }}
                onCreate={handleCreate}
                onUpdate={update}
                onTrash={trash}
                onRestore={restore}
                onRemove={remove}
                presentation="panel"
              />
            ) : (
              <MainPlaceholder
                view={view}
                hasNotes={notes.length > 0}
                onNewNote={() => setTarget({ mode: "new" })}
              />
            )}
          </div>
        </main>
      </div>

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

      {settingsOpen && (
        <SettingsPane
          importing={importing}
          importRef={importRef}
          notes={notes}
          isGuest={isGuest}
          onImportClick={() => importRef.current?.click()}
          onImport={handleImport}
          onGuestExport={handleGuestExport}
          onClose={() => setSettingsOpen(false)}
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

function GuestSaveBanner({
  isGuest,
  hasLocalNotes,
  onSave,
  compact = false,
}: {
  isGuest: boolean;
  hasLocalNotes: boolean;
  onSave: () => Promise<{ saved: number }>;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 ${
        compact ? "mb-3" : "mb-6"
      }`}
    >
      <p className="text-sm text-[var(--color-muted)]">
        {hasLocalNotes
          ? "Some notes are saved only in this browser."
          : "These notes are saved only in this browser."}
      </p>
      {isGuest ? (
        <a
          href="/signin?from=/"
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          Sign in to save
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            onSave().catch((error) => {
              alert(error instanceof Error ? error.message : "Failed to save");
            });
          }}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          Save to account
        </button>
      )}
    </div>
  );
}

function SettingsPane({
  importing,
  importRef,
  notes,
  isGuest,
  onImportClick,
  onImport,
  onGuestExport,
  onClose,
}: {
  importing: boolean;
  importRef: React.RefObject<HTMLInputElement>;
  notes: Note[];
  isGuest: boolean;
  onImportClick: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGuestExport: () => void;
  onClose: () => void;
}) {
  const exportableCount = notes.filter((note) => !note.trashed).length;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default bg-black/35"
        onClick={onClose}
      />
      <section className="absolute right-4 top-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:right-6">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <input
            ref={importRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={onImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={onImportClick}
            disabled={importing}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:opacity-60"
          >
            <span>{importing ? "Importing..." : "Import Google Keep"}</span>
            <UploadIcon className="h-4 w-4" />
          </button>

          {exportableCount > 0 && isGuest ? (
            <button
              type="button"
              onClick={onGuestExport}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              <span>Export notes</span>
              <DownloadIcon className="h-4 w-4" />
            </button>
          ) : exportableCount > 0 ? (
            <a
              href="/api/notes/export"
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              onClick={onClose}
            >
              <span>Export notes</span>
              <DownloadIcon className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] opacity-60"
            >
              <span>Export notes</span>
              <DownloadIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>
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


function DbError({
  error,
  onRetry,
  compact = false,
}: {
  error: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 ${
        compact ? "mb-3" : "mb-6"
      }`}
    >
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

const VIEW_LABELS: Record<View, string> = {
  all: "All notes",
  pinned: "Pinned",
  archive: "Archive",
  trash: "Trash",
};

type DateBucket = { label: string; notes: Note[] };

function bucketByDate(notes: Note[]): DateBucket[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400_000;
  const startOf7d = startOfToday - 7 * 86400_000;
  const startOf30d = startOfToday - 30 * 86400_000;

  const buckets: Record<string, Note[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    "Previous 30 days": [],
    Older: [],
  };

  for (const note of notes) {
    const t = note.updatedAt;
    if (t >= startOfToday) buckets.Today.push(note);
    else if (t >= startOfYesterday) buckets.Yesterday.push(note);
    else if (t >= startOf7d) buckets["Previous 7 days"].push(note);
    else if (t >= startOf30d) buckets["Previous 30 days"].push(note);
    else buckets.Older.push(note);
  }

  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, notes: list }));
}

function Sidebar({
  view,
  setView,
  counts,
  hydrated,
  filtered,
  activeNoteId,
  onOpenNote,
  onNewNote,
  onOpenSearch,
  onOpenSettings,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  setTint,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { all: number; pinned: number; archive: number; trash: number };
  hydrated: boolean;
  filtered: Note[];
  activeNoteId: string | null;
  onOpenNote: (note: Note) => void;
  onNewNote: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  trash: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  setTint: (id: string, tint: import("@/lib/types").Tint) => void;
}) {
  const buckets = bucketByDate(filtered);
  const viewItems: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All notes", count: counts.all },
    { key: "pinned", label: "Pinned", count: counts.pinned },
    { key: "archive", label: "Archive", count: counts.archive },
    { key: "trash", label: "Trash", count: counts.trash },
  ];

  return (
    <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-canvas)] md:flex">
      <div className="flex flex-col gap-1 p-2">
        <button
          type="button"
          onClick={onNewNote}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            <PencilPlusIcon className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium">New note</span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md">
            <SearchIcon className="h-3.5 w-3.5" />
          </span>
          <span>Search notes</span>
        </button>
      </div>

      <div className="px-2 pb-2">
        <ul className="flex flex-col">
          {viewItems.map((item) => {
            const active = view === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setView(item.key)}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm ${
                    active
                      ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {item.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!hydrated ? null : filtered.length === 0 ? (
          <p className="px-2 py-6 text-xs text-[var(--color-muted)]">
            No {VIEW_LABELS[view].toLowerCase()}.
          </p>
        ) : (
          buckets.map((bucket) => (
            <section key={bucket.label} className="mt-3 first:mt-2">
              <h3 className="px-2.5 pb-1 text-xs font-medium text-[var(--color-muted)]">
                {bucket.label}
              </h3>
              <ul>
                {bucket.notes.map((note) => (
                  <SidebarNoteRow
                    key={note.id}
                    note={note}
                    active={note.id === activeNoteId}
                    onOpen={() => onOpenNote(note)}
                    trashMode={view === "trash"}
                    togglePin={() => togglePin(note.id)}
                    toggleArchive={() => toggleArchive(note.id)}
                    trash={() => trash(note.id)}
                    restore={() => restore(note.id)}
                    remove={() => remove(note.id)}
                    setTint={(t) => setTint(note.id, t)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="border-t border-[var(--color-border)] p-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          <SettingsIcon className="h-4 w-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}

function SidebarNoteRow({
  note,
  active,
  onOpen,
  trashMode,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  setTint,
}: {
  note: Note;
  active: boolean;
  onOpen: () => void;
  trashMode: boolean;
  togglePin: () => void;
  toggleArchive: () => void;
  trash: () => void;
  restore: () => void;
  remove: () => void;
  setTint: (t: import("@/lib/types").Tint) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li
      className={`group relative flex items-center rounded-md ${
        active ? "bg-[var(--color-surface-hover)]" : "hover:bg-[var(--color-surface-hover)]"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm text-[var(--color-text)]"
      >
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: TINT_HEX_SOLID[note.tint] }}
        />
        <span className="truncate">{previewText(note)}</span>
        {note.pinned && !trashMode && (
          <PinFilledIcon className="ml-auto h-3 w-3 shrink-0 text-[var(--color-muted)]" />
        )}
      </button>
      <button
        type="button"
        aria-label="More"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className={`mr-1 grid h-6 w-6 place-items-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <DotsIcon className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-1 top-7 z-20 w-44 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg">
            {trashMode ? (
              <>
                <MenuItem
                  onClick={() => {
                    restore();
                    setMenuOpen(false);
                  }}
                >
                  Restore
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    if (confirm("Permanently delete this note?")) remove();
                    setMenuOpen(false);
                  }}
                >
                  Delete forever
                </MenuItem>
              </>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    togglePin();
                    setMenuOpen(false);
                  }}
                >
                  {note.pinned ? "Unpin" : "Pin"}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    toggleArchive();
                    setMenuOpen(false);
                  }}
                >
                  {note.archived ? "Unarchive" : "Archive"}
                </MenuItem>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <div className="px-3 py-1.5 text-xs text-[var(--color-muted)]">
                  Tint
                </div>
                <div className="px-3 pb-2">
                  <TintPicker
                    value={note.tint}
                    onChange={(t) => {
                      setTint(t);
                      setMenuOpen(false);
                    }}
                  />
                </div>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <MenuItem
                  danger
                  onClick={() => {
                    trash();
                    setMenuOpen(false);
                  }}
                >
                  Move to Trash
                </MenuItem>
              </>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function MenuItem({
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
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-surface-hover)] ${
        danger
          ? "text-[var(--color-danger)]"
          : "text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function MainPlaceholder({
  view,
  hasNotes,
  onNewNote,
}: {
  view: View;
  hasNotes: boolean;
  onNewNote: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-[var(--color-border)]">
      <div className="px-8 text-center">
        <p className="text-base font-medium text-[var(--color-text)]">
          {hasNotes ? "Select a note" : "No notes yet"}
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {hasNotes
            ? `Open a ${VIEW_LABELS[view].toLowerCase()} from the sidebar, or create a new note.`
            : "Start by creating your first note."}
        </p>
        <button
          type="button"
          onClick={onNewNote}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent-border)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          <PencilPlusIcon className="h-3.5 w-3.5" />
          New note
        </button>
      </div>
    </div>
  );
}

function PencilPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
