"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { useNotes, SyncStatus } from "@/lib/useNotes";
import { Note } from "@/lib/types";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import {
  ArchiveIcon,
  DownloadIcon,
  PinFilledIcon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/Icons";

function searchableText(note: { body: string; title: string; tags?: string[] }) {
  const base = note.body.trim() || note.title.trim();
  if (note.tags?.length) return base + " " + note.tags.join(" ");
  return base;
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

export function NotesView({
  initialNoteId,
}: {
  initialNoteId: string | null;
}) {
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
    share,
    unshare,
    syncStatus,
  } = useNotes();

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [target, setTarget] = useState<EditorTarget>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"active" | "archive" | "trash">(
    "active",
  );
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const didRestoreFromUrlRef = useRef(false);

  const counts = useMemo(
    () => ({
      archive: notes.filter((n) => n.archived && !n.trashed).length,
      trash: notes.filter((n) => n.trashed).length,
    }),
    [notes],
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      if (!n.trashed) for (const t of n.tags) set.add(t);
    }
    return [...set].sort();
  }, [notes]);

  const filtered = useMemo(() => {
    const q = searchOpen ? query.trim() : "";
    const viewFiltered = notes
      .filter((n) => {
        if (viewMode === "trash") return n.trashed;
        if (viewMode === "archive") return n.archived && !n.trashed;
        return !n.archived && !n.trashed;
      })
      .filter((n) => !tagFilter || n.tags.includes(tagFilter));
    if (!q) return viewFiltered.sort((a, b) => b.updatedAt - a.updatedAt);
    const fuse = new Fuse(viewFiltered, {
      keys: ["title", "body"],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    return fuse.search(q).map((r) => r.item);
  }, [notes, query, searchOpen, tagFilter, viewMode]);

  const visibleNotes = filtered;
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
      setActiveNoteId(note.id);
      // Promote the open editor from "new" to "edit" so its header picks up
      // the saved id and saving indicator (and any later updates flow through
      // the edit-mode autosave path).
      setTarget((current) =>
        current?.mode === "new" ? { mode: "edit", note } : current,
      );
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

  // Reopen the note named in the URL path (/<noteId>) once the notes list
  // has hydrated and that note is actually present.
  useEffect(() => {
    if (didRestoreFromUrlRef.current || !hydrated) return;
    if (!initialNoteId) {
      didRestoreFromUrlRef.current = true;
      setTarget({ mode: "new" });
      return;
    }
    const note = notes.find((n) => n.id === initialNoteId);
    if (!note) return;
    didRestoreFromUrlRef.current = true;
    setActiveNoteId(note.id);
    setTarget({ mode: "edit", note });
  }, [hydrated, notes, initialNoteId]);

  // Mirror the open note into the URL path so refresh restores it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = target?.mode === "edit" ? target.note.id : null;
    const desired = id ? `/${id}` : "/";
    if (window.location.pathname === desired) return;
    window.history.replaceState(null, "", desired + window.location.search);
  }, [target]);

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
        if (searchOpen) closeSearch();
        else openSearch();
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

      if (event.key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
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
        if (activeNote.trashed) {
          if (confirm("Permanently delete this note?")) remove(activeNote.id);
        } else {
          trash(activeNote.id);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeNote, activeNoteId, remove, searchOpen, target, toggleArchive, togglePin, trash, visibleNotes]);

  // Re-resolve edit targets against the live notes list so saved-title
  // updates from autosave reach the editor (otherwise target.note is the
  // stale snapshot captured at click time).
  const mainTarget: EditorTarget =
    target?.mode === "edit"
      ? {
          mode: "edit",
          note: notes.find((n) => n.id === target.note.id) ?? target.note,
        }
      : target;

  const sidebarProps = {
    hydrated,
    filtered,
    activeNoteId,
    viewMode,
    allTags,
    tagFilter,
    onTagFilter: setTagFilter,
    syncStatus,
    onExitFilteredView: () => { setViewMode("active"); setTagFilter(null); },
    onOpenNote: openNote,
    onNewNote: () => {
      setActiveNoteId(null);
      setViewMode("active");
      setTarget({ mode: "new" });
    },
    onOpenSettings: () => setSettingsOpen(true),
    togglePin,
    toggleArchive,
    trash,
    restore,
    remove,
  };

  const editorPanel = (
    <>
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
            onClose={() => setTarget(null)}
            onCreate={handleCreate}
            onUpdate={update}
            onTrash={trash}
            onRestore={restore}
            onRemove={remove}
            onShare={share}
            onUnshare={unshare}
            canShare={!isGuest}
            presentation="panel"
          />
        ) : (
          <MainPlaceholder
            hasNotes={!hydrated || notes.length > 0}
            onNewNote={() => setTarget({ mode: "new" })}
          />
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: sidebar + editor side by side */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <Sidebar {...sidebarProps} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
          {editorPanel}
        </main>
      </div>

      {/* Mobile: full-screen list or full-screen editor */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mainTarget ? (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Notes
              </button>
            </div>
            {editorPanel}
          </main>
        ) : (
          <Sidebar {...sidebarProps} mobile />
        )}
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
          counts={counts}
          onOpenArchive={() => {
            setViewMode("archive");
            setSettingsOpen(false);
            setActiveNoteId(null);
            setTarget(null);
          }}
          onOpenTrash={() => {
            setViewMode("trash");
            setSettingsOpen(false);
            setActiveNoteId(null);
            setTarget(null);
          }}
          onImportClick={() => importRef.current?.click()}
          onImport={handleImport}
          onGuestExport={handleGuestExport}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
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
  counts,
  onOpenArchive,
  onOpenTrash,
  onImportClick,
  onImport,
  onGuestExport,
  onClose,
}: {
  importing: boolean;
  importRef: React.RefObject<HTMLInputElement>;
  notes: Note[];
  isGuest: boolean;
  counts: { archive: number; trash: number };
  onOpenArchive: () => void;
  onOpenTrash: () => void;
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
          <button
            type="button"
            onClick={onOpenArchive}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            <span className="flex items-center gap-2">
              <ArchiveIcon className="h-4 w-4 text-[var(--color-muted)]" />
              Archive
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {counts.archive}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenTrash}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            <span className="flex items-center gap-2">
              <TrashIcon className="h-4 w-4 text-[var(--color-muted)]" />
              Trash
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {counts.trash}
            </span>
          </button>

          <div className="h-px" />

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
    <div data-search-overlay className="fixed inset-0 z-40 px-4 pt-[14vh]">
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
  hydrated,
  filtered,
  activeNoteId,
  viewMode,
  allTags,
  tagFilter,
  onTagFilter,
  syncStatus,
  onExitFilteredView,
  onOpenNote,
  onNewNote,
  onOpenSettings,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  mobile,
}: {
  hydrated: boolean;
  filtered: Note[];
  activeNoteId: string | null;
  viewMode: "active" | "archive" | "trash";
  allTags: string[];
  tagFilter: string | null;
  onTagFilter: (tag: string | null) => void;
  syncStatus: SyncStatus;
  onExitFilteredView: () => void;
  onOpenNote: (note: Note) => void;
  onNewNote: () => void;
  onOpenSettings: () => void;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  trash: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  mobile?: boolean;
}) {
  const buckets = bucketByDate(filtered);
  const filteredTitle =
    viewMode === "archive" ? "Archive" : viewMode === "trash" ? "Trash" : null;

  return (
    <aside className={
      mobile
        ? "flex h-full w-full flex-col bg-[var(--color-canvas)]"
        : "hidden h-full w-[260px] shrink-0 flex-col bg-[var(--color-canvas)] md:flex"
    }>
      <div className="flex flex-col gap-1 p-2">
        <button
          type="button"
          onClick={onNewNote}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            <PlusIcon className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium">New note</span>
        </button>
      </div>

      {allTags.length > 0 && viewMode === "active" && (
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
              className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                tagFilter === tag
                  ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                  : "bg-[var(--color-surface-hover)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filteredTitle && (
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            {filteredTitle}
          </span>
          <button
            type="button"
            onClick={onExitFilteredView}
            className="text-xs text-[var(--color-link)] hover:underline"
          >
            Back to notes
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!hydrated ? (
          <div className="space-y-2 px-2 pt-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-md bg-[var(--color-surface-hover)]"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-xs text-[var(--color-muted)]">
            {filteredTitle ? `${filteredTitle} is empty.` : "No notes."}
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
                    trashMode={note.trashed}
                    togglePin={() => togglePin(note.id)}
                    toggleArchive={() => toggleArchive(note.id)}
                    trash={() => trash(note.id)}
                    restore={() => restore(note.id)}
                    remove={() => remove(note.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="p-2">
        <div className="flex items-center justify-between px-2.5 py-1">
          <SyncIndicator status={syncStatus} />
          <button
            type="button"
            onClick={onOpenSettings}
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            title="Settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SyncIndicator({ status }: { status: SyncStatus }) {
  if (status === "idle") return null;

  const config = {
    syncing: { color: "text-[var(--color-link)]", label: "Saving..." },
    saved: { color: "text-[var(--color-accent)]", label: "Saved" },
    error: { color: "text-[var(--color-danger)]", label: "Sync error" },
    offline: { color: "text-[var(--color-attention)]", label: "Offline" },
  }[status];

  return (
    <span className={`flex items-center gap-1.5 text-xs ${config.color}`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${
          status === "syncing" ? "animate-pulse" : ""
        }`}
      />
      {config.label}
    </span>
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

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    items: [
      { keys: ["j", "↓"], label: "Next note" },
      { keys: ["k", "↑"], label: "Previous note" },
      { keys: ["Enter", "o"], label: "Open note" },
      { keys: ["Esc"], label: "Close editor" },
    ],
  },
  {
    title: "Actions",
    items: [
      { keys: ["n", "c"], label: "New note" },
      { keys: ["p"], label: "Toggle pin" },
      { keys: ["a"], label: "Toggle archive" },
      { keys: ["Del"], label: "Move to trash" },
    ],
  },
  {
    title: "Global",
    items: [
      { keys: ["⌘K"], label: "Search" },
      { keys: ["/", "f"], label: "Search" },
      { keys: ["?"], label: "Shortcuts" },
      { keys: ["⌘Enter"], label: "Close editor" },
    ],
  },
];

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close shortcuts"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-5 p-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-[var(--color-text)]">
                      {item.label}
                    </span>
                    <span className="flex gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-block min-w-[22px] rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-center font-mono text-[11px] text-[var(--color-muted)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MainPlaceholder({
  hasNotes,
  onNewNote,
}: {
  hasNotes: boolean;
  onNewNote: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="px-8 text-center">
        <p className="text-base font-medium text-[var(--color-text)]">
          {hasNotes ? "Select a note" : "No notes yet"}
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {hasNotes
            ? "Open a note from the sidebar, or create a new one."
            : "Start by creating your first note."}
        </p>
        <button
          type="button"
          onClick={onNewNote}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent-border)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New note
        </button>
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
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
      <path d="M15 18l-6-6 6-6" />
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
