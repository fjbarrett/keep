"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { useNotes } from "@/lib/useNotes";
import { Note, View } from "@/lib/types";
import { NoteList } from "@/components/NoteList";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { EmptyState } from "@/components/EmptyState";
import { TINT_HEX_SOLID } from "@/components/TintPicker";
import {
  DownloadIcon,
  PlusIcon,
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

  const allActive = notes.filter((n) => !n.trashed);
  const recentEdits = [...allActive]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  const topPinned = notes
    .filter((n) => n.pinned && !n.archived && !n.trashed)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  return (
    <>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">
        {error && <DbError error={error} onRetry={refresh} />}
        {(isGuest || hasLocalNotes) && notes.length > 0 && (
          <GuestSaveBanner
            isGuest={isGuest}
            hasLocalNotes={hasLocalNotes}
            onSave={saveLocalNotes}
          />
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[256px_minmax(0,1fr)_296px]">
          <LeftRail
            view={view}
            setView={setView}
            counts={counts}
            topPinned={topPinned}
            onOpenNote={openNote}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          <CenterFeed
            view={view}
            setView={setView}
            counts={counts}
            hydrated={hydrated}
            filtered={filtered}
            pinned={pinned}
            others={others}
            activeNoteId={activeNoteId}
            openNote={openNote}
            setActiveNoteId={setActiveNoteId}
            togglePin={togglePin}
            toggleArchive={toggleArchive}
            trash={trash}
            restore={restore}
            remove={remove}
            setTint={setTint}
            onNewNote={() => setTarget({ mode: "new" })}
            onOpenSearch={openSearch}
            query={searchOpen ? query : ""}
          />

          <RightRail
            recentEdits={recentEdits}
            totalCount={allActive.length}
            counts={counts}
            onOpenNote={openNote}
          />
        </div>
      </main>

      <NoteEditor
        target={editorTarget}
        onClose={() => setTarget(null)}
        onCreate={handleCreate}
        onUpdate={update}
        onTrash={trash}
        onRestore={restore}
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

function ViewTabs({
  view,
  setView,
  counts,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { all: number; pinned: number; archive: number; trash: number };
}) {
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pinned", label: "Pinned", count: counts.pinned },
    { key: "archive", label: "Archive", count: counts.archive },
    { key: "trash", label: "Trash", count: counts.trash },
  ];
  return (
    <div className="-mb-px flex items-end gap-1 border-b border-[var(--color-border)]">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          data-active={view === t.key}
          onClick={() => setView(t.key)}
          className="gh-tab"
        >
          {t.label}
          <span className="gh-counter">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

function LeftRail({
  view,
  setView,
  counts,
  topPinned,
  onOpenNote,
  onOpenSettings,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { all: number; pinned: number; archive: number; trash: number };
  topPinned: Note[];
  onOpenNote: (note: Note) => void;
  onOpenSettings: () => void;
}) {
  const navItems: { key: View; label: string; count: number }[] = [
    { key: "all", label: "All notes", count: counts.all },
    { key: "pinned", label: "Pinned", count: counts.pinned },
    { key: "archive", label: "Archive", count: counts.archive },
    { key: "trash", label: "Trash", count: counts.trash },
  ];

  return (
    <aside className="hidden flex-col gap-6 lg:flex">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="gh-section-label">Top notes</h2>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            aria-label="Settings"
            title="Settings"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        {topPinned.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">
            Pinned notes will show here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {topPinned.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onOpenNote(note)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                >
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]"
                    style={{ background: TINT_HEX_SOLID[note.tint] }}
                  />
                  <span className="truncate text-[var(--color-link)] hover:underline">
                    {previewText(note)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="gh-section-label mb-3">Views</h2>
        <ul className="flex flex-col">
          {navItems.map((item) => {
            const active = view === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => setView(item.key)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                    active
                      ? "bg-[var(--color-surface-hover)] font-semibold text-[var(--color-text)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="gh-counter">{item.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

function CenterFeed({
  view,
  setView,
  counts,
  hydrated,
  filtered,
  pinned,
  others,
  activeNoteId,
  openNote,
  setActiveNoteId,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  setTint,
  onNewNote,
  onOpenSearch,
  query,
}: {
  view: View;
  setView: (v: View) => void;
  counts: { all: number; pinned: number; archive: number; trash: number };
  hydrated: boolean;
  filtered: Note[];
  pinned: Note[];
  others: Note[];
  activeNoteId: string | null;
  openNote: (note: Note) => void;
  setActiveNoteId: (id: string) => void;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  trash: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  setTint: (id: string, tint: import("@/lib/types").Tint) => void;
  onNewNote: () => void;
  onOpenSearch: () => void;
  query: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          {VIEW_TITLES[view]}
        </h1>
        <button
          type="button"
          onClick={onNewNote}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-accent-border)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New note
        </button>
      </div>

      <ViewTabs view={view} setView={setView} counts={counts} />

      <div className="rounded-b-md rounded-tr-md border border-[var(--color-border)] border-t-0 bg-[var(--color-background)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex flex-1 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            <SearchIcon className="h-3.5 w-3.5" />
            <span>Search notes...</span>
            <span className="ml-auto rounded border border-[var(--color-border)] px-1 py-0.5 font-mono text-[10px]">
              /
            </span>
          </button>
          <span className="text-xs text-[var(--color-muted)]">
            {hydrated
              ? `${filtered.length} ${filtered.length === 1 ? "note" : "notes"}`
              : "loading..."}
          </span>
        </div>

        <div className="min-h-[240px]">
          {!hydrated ? null : filtered.length === 0 ? (
            <div className="p-6">
              {query ? <NoResults query={query} /> : <EmptyState view={view} />}
            </div>
          ) : (
            <div>
              {view === "all" && pinned.length > 0 && (
                <NoteList
                  notes={pinned}
                  activeId={activeNoteId}
                  onOpen={openNote}
                  onSelect={setActiveNoteId}
                  onTogglePin={togglePin}
                  onToggleArchive={toggleArchive}
                  onRemove={trash}
                  onRestore={restore}
                  onDestroy={remove}
                  onSetTint={setTint}
                  trashMode={false}
                />
              )}
              <NoteList
                notes={others}
                activeId={activeNoteId}
                onOpen={openNote}
                onSelect={setActiveNoteId}
                onTogglePin={togglePin}
                onToggleArchive={toggleArchive}
                onRemove={trash}
                onRestore={restore}
                onDestroy={remove}
                onSetTint={setTint}
                trashMode={view === "trash"}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RightRail({
  recentEdits,
  totalCount,
  counts,
  onOpenNote,
}: {
  recentEdits: Note[];
  totalCount: number;
  counts: { all: number; pinned: number; archive: number; trash: number };
  onOpenNote: (note: Note) => void;
}) {
  return (
    <aside className="hidden flex-col gap-6 lg:flex">
      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="border-b border-[var(--color-border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Latest changes
          </h2>
        </div>
        {recentEdits.length === 0 ? (
          <p className="px-4 py-4 text-xs text-[var(--color-muted)]">
            No recent edits yet.
          </p>
        ) : (
          <ul>
            {recentEdits.map((note) => (
              <li
                key={note.id}
                className="border-t border-[var(--color-border-muted)] first:border-t-0"
              >
                <button
                  type="button"
                  onClick={() => onOpenNote(note)}
                  className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-surface-hover)]"
                >
                  <span
                    aria-hidden
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: TINT_HEX_SOLID[note.tint] }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--color-link)] hover:underline">
                      {previewText(note)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {new Date(note.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="border-b border-[var(--color-border)] px-4 py-2.5">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Stats
          </h2>
        </div>
        <dl className="divide-y divide-[var(--color-border-muted)]">
          {[
            { label: "Active notes", value: totalCount },
            { label: "Pinned", value: counts.pinned },
            { label: "Archived", value: counts.archive },
            { label: "In Trash", value: counts.trash },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <dt className="text-[var(--color-muted)]">{row.label}</dt>
              <dd className="font-mono text-[var(--color-text)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
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
