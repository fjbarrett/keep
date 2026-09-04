"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { searchableText } from "@/lib/inferTitle";
import { useNotes } from "@/lib/useNotes";
import { Note } from "@/lib/types";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { NotesGrid } from "@/components/NotesGrid";
import { Sidebar } from "@/components/Sidebar";
import { NoteInfoModal } from "@/components/NoteInfoModal";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SettingsPane } from "@/components/SettingsPane";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import {
  DatabaseError,
  GuestSaveBanner,
  MainPlaceholder,
  MiniRail,
} from "@/components/NotesViewChrome";
import { exportGuestNotes } from "@/lib/guestNoteExport";

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
  ownerId,
}: {
  initialNoteId: string | null;
  ownerId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
    importTextFiles,
    saveLocalNotes,
    togglePin,
    toggleArchive,
    share,
    unshare,
    setShareToken,
    syncStatus,
  } = useNotes(ownerId);

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
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Where the notes grid was scrolled to before a note was opened over it.
  // A different view (archive, trash) is a different list, so start it at top.
  const gridScrollRef = useRef(0);
  useEffect(() => {
    gridScrollRef.current = 0;
  }, [viewMode]);
  const [infoNote, setInfoNote] = useState<Note | null>(null);
  // True while a /note/<id> deep link is still resolving — keeps the main pane
  // blank instead of flashing the grid/placeholder before the note opens.
  const [restoringFromUrl, setRestoringFromUrl] = useState(!!initialNoteId);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const importTextsRef = useRef<HTMLInputElement>(null);
  const handledPathRef = useRef<string | null>(null);
  const pendingPathRef = useRef<string | null>(null);
  const applyingRouteRef = useRef(false);
  // Id of the note created from the current compose session. Lets the editor's
  // remount key stay stable across the new → edit autosave bridge so the editor
  // isn't remounted (which would discard in-flight keystrokes).
  const composedIdRef = useRef<string | null>(null);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("keep.sidebarCollapsed") === "1");
  }, []);

  function toggleSidebar(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    localStorage.setItem("keep.sidebarCollapsed", collapsed ? "1" : "0");
  }

  const counts = useMemo(
    () => ({
      archive: notes.filter((n) => n.archived && !n.trashed).length,
      trash: notes.filter((n) => n.trashed).length,
    }),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = searchOpen ? query.trim() : "";
    const viewFiltered = notes
      .filter((n) => {
        if (viewMode === "trash") return n.trashed;
        if (viewMode === "archive") return n.archived && !n.trashed;
        return !n.archived && !n.trashed;
      });
    if (!q)
      return viewFiltered.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
    // Require every query token to appear literally, so results always contain
    // what was typed. Fuse on its own is fuzzy enough to surface notes that
    // don't contain the query at all; use it only to rank the notes that do.
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const contains = viewFiltered.filter((n) => {
      const hay = `${n.title}\n${n.body}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    const fuse = new Fuse(contains, {
      keys: [
        { name: "title", getFn: (n: Note) => searchableText(n) },
        "body",
      ],
      threshold: 0.5,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    const ranked = fuse.search(q).map((r) => r.item);
    const seen = new Set(ranked.map((n) => n.id));
    // Keep any containing note Fuse didn't rank (e.g. a match only in the body).
    return [...ranked, ...contains.filter((n) => !seen.has(n.id))];
  }, [notes, query, searchOpen, viewMode]);

  const visibleNotes = filtered;
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

  function openNote(note: Note | null, highlightQuery?: string) {
    if (!note) return;
    composedIdRef.current = null;
    setSearchOpen(false);
    setQuery("");
    setActiveNoteId(note.id);
    setTarget({ mode: "edit", note, highlightQuery });
  }

  async function handleCreate(partial: Partial<Note>) {
    const note = await create(partial);
    if (note) {
      composedIdRef.current = note.id;
      setActiveNoteId(note.id);
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

  async function handleImportTexts(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      await importTextFiles(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleGuestExport() {
    await exportGuestNotes(notes);
  }

  useEffect(() => {
    setBannerDismissed(
      sessionStorage.getItem("keep.guestBannerDismissed") === "1",
    );
  }, []);

  function dismissBanner() {
    sessionStorage.setItem("keep.guestBannerDismissed", "1");
    setBannerDismissed(true);
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
    if (!hydrated) return;
    if (handledPathRef.current === pathname) return;
    handledPathRef.current = pathname;
    if (pendingPathRef.current === pathname) {
      pendingPathRef.current = null;
      setRestoringFromUrl(false);
      return;
    }
    pendingPathRef.current = null;
    const routeNoteId = pathname.match(/^\/note\/([^/]+)$/)?.[1] ?? null;
    const note = routeNoteId ? notes.find((item) => item.id === routeNoteId) : null;
    setRestoringFromUrl(false);
    if (routeNoteId && note) {
      if (target?.mode !== "edit" || target.note.id !== note.id) {
        applyingRouteRef.current = true;
        setActiveNoteId(note.id);
        setTarget({ mode: "edit", note, autoFocus: false });
      }
    } else if (routeNoteId) {
      applyingRouteRef.current = target !== null;
      setActiveNoteId(null);
      setTarget(null);
      pendingPathRef.current = "/";
      router.replace("/" + window.location.search, { scroll: false });
    } else if (target?.mode === "edit") {
      applyingRouteRef.current = true;
      setTarget(null);
    }
  }, [hydrated, notes, pathname, router, target]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated || restoringFromUrl) return;
    if (applyingRouteRef.current) {
      applyingRouteRef.current = false;
      return;
    }
    const id = target?.mode === "edit" ? target.note.id : null;
    const desired = id ? `/note/${id}` : "/";
    if (pathname === desired || pendingPathRef.current === desired) return;
    pendingPathRef.current = desired;
    // Next patches native history into usePathname; this keeps the editor DOM
    // mounted while still making the current note URL copyable and restorable.
    window.history.replaceState(null, "", desired + window.location.search);
  }, [hydrated, pathname, restoringFromUrl, target]);

  useEffect(() => {
    // Don't auto-select while composing a new note — sidebar should show nothing selected
    if (target?.mode === "new" || target === null) return;
    if (visibleNotes.length === 0) {
      setActiveNoteId(null);
      return;
    }
    if (!activeNoteId || !visibleNotes.some((note) => note.id === activeNoteId)) {
      setActiveNoteId(visibleNotes[0].id);
    }
  }, [activeNoteId, target, visibleNotes]);

  useEffect(() => {
    function selectByOffset(offset: number) {
      if (visibleNotes.length === 0) return;
      const currentIndex = Math.max(
        0,
        visibleNotes.findIndex((note) => note.id === activeNoteId),
      );
      const nextIndex =
        (currentIndex + offset + visibleNotes.length) % visibleNotes.length;
      const next = visibleNotes[nextIndex];
      setActiveNoteId(next.id);
      // With the editor pane open, j/k steps through notes in place. Keep
      // focus out of the text so the next keystroke still navigates.
      if (target?.mode === "edit") {
        setTarget({ mode: "edit", note: next, autoFocus: false });
      }
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

      // ⌘I — Get Info for the active note (Mac "Get Info" muscle memory).
      if ((event.metaKey || event.ctrlKey) && key === "i") {
        event.preventDefault();
        if (activeNote) setInfoNote(activeNote);
        return;
      }

      // ⌘/ (and ⌘?) toggles the shortcuts sheet even while typing.
      if ((event.metaKey || event.ctrlKey) && (key === "/" || event.key === "?")) {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      // Note actions that stay usable while writing — the same combos as the
      // Mac app's Note menu. They act on the open note, falling back to the
      // list selection when nothing is open.
      const comboNote =
        target?.mode === "edit"
          ? (notes.find((n) => n.id === target.note.id) ?? target.note)
          : target
            ? null
            : activeNote;
      if (event.metaKey && event.shiftKey && key === "p") {
        event.preventDefault();
        if (comboNote) togglePin(comboNote.id);
        return;
      }
      if (event.metaKey && event.ctrlKey && key === "a") {
        event.preventDefault();
        if (comboNote) toggleArchive(comboNote.id);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Bare "?" opens the sheet whenever the user isn't typing in a field.
      if (!typing && (event.key === "?" || (event.shiftKey && key === "/"))) {
        event.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (searchFocused) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          selectByOffset(1);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          selectByOffset(-1);
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          openNote(activeNote ?? visibleNotes[0] ?? null, query);
          return;
        }

        if (event.key === "Escape") closeSearch();
        return;
      }

      if (typing) return;

      // Composing a new note: nothing below should fire mid-compose.
      if (target?.mode === "new") return;

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
          if (confirm("Permanently delete this text?")) remove(activeNote.id);
        } else {
          trash(activeNote.id);
          if (target?.mode === "edit" && target.note.id === activeNote.id) {
            setTarget(null);
          }
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeNote, activeNoteId, notes, query, remove, searchOpen, target, toggleArchive, togglePin, trash, visibleNotes]);

  const mainTarget: EditorTarget =
    target?.mode === "edit"
      ? {
          mode: "edit",
          note: notes.find((n) => n.id === target.note.id) ?? target.note,
          highlightQuery: target.highlightQuery,
          autoFocus: target.autoFocus,
        }
      : target;

  const sidebarProps = {
    hydrated,
    filtered,
    activeNoteId,
    viewMode,
    syncStatus,
    onExitFilteredView: () => setViewMode("active"),
    onOpenNote: openNote,
    onNewNote: () => {
      setActiveNoteId(null);
      setViewMode("active");
      setTarget({ mode: "new" });
    },
    onOpenSearch: openSearch,
    onOpenSettings: () => setSettingsOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
    togglePin,
    toggleArchive,
    trash,
    restore,
    remove,
    onRename: (id: string, title: string) => update(id, { title }),
    onInfo: (note: Note) => setInfoNote(note),
    onColor: (id: string, color: string | null) => update(id, { color }),
    onCollapse: () => toggleSidebar(true),
  };

  // All open notes share one key ("note") so switching between them updates the
  // editor in place — no remount, so it doesn't re-run Shiki or flash. The key
  // only changes for the empty placeholder / compose / a note being open.
  const editorKey = !mainTarget
    ? "empty"
    : mainTarget.mode === "new" || mainTarget.note.id === composedIdRef.current
      ? "compose"
      : "note";

  const editorPanel = (
    <>
      {error && (
        <div className="px-6 pt-4">
          <DatabaseError error={error} onRetry={refresh} />
        </div>
      )}
      {(isGuest || hasLocalNotes) && notes.length > 0 && !bannerDismissed && (
        <div className="px-6 pt-4">
          <GuestSaveBanner
            isGuest={isGuest}
            hasLocalNotes={hasLocalNotes}
            onSave={saveLocalNotes}
            onDismiss={dismissBanner}
          />
        </div>
      )}

      <div
        key={editorKey}
        className="flex min-h-0 flex-1 flex-col p-4"
      >
        {mainTarget ? (
          <NoteEditor
            target={mainTarget}
            onClose={() => setTarget(null)}
            onBack={() => setTarget(null)}
            onCreate={handleCreate}
            onUpdate={update}
            onTrash={trash}
            onRestore={restore}
            onRemove={remove}
            onColor={(color) =>
              mainTarget.mode === "edit" && update(mainTarget.note.id, { color })
            }
            onRename={(title) =>
              mainTarget.mode === "edit" && update(mainTarget.note.id, { title })
            }
            presentation="panel"
          />
        ) : restoringFromUrl || !hydrated ? (
          <div className="flex-1" aria-hidden />
        ) : visibleNotes.length > 0 ? (
          <NotesGrid
            notes={visibleNotes}
            trashMode={viewMode === "trash"}
            scrollMemory={gridScrollRef}
            onOpen={(note) => openNote(note)}
            onTogglePin={togglePin}
            onToggleArchive={toggleArchive}
            onTrash={trash}
            onRestore={restore}
            onRemove={remove}
            onColor={(id, color) => update(id, { color })}
          />
        ) : (
          <MainPlaceholder
            hasNotes={notes.length > 0}
            onNewNote={() => setTarget({ mode: "new" })}
          />
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: sidebar (or mini rail) + editor side by side */}
      <div className="hidden min-h-0 flex-1 bg-[var(--color-canvas)] md:flex">
        {sidebarCollapsed ? (
          <MiniRail
            onNewNote={sidebarProps.onNewNote}
            onOpenSettings={sidebarProps.onOpenSettings}
            onOpenShortcuts={sidebarProps.onOpenShortcuts}
            onExpand={() => toggleSidebar(false)}
          />
        ) : (
          <Sidebar {...sidebarProps} />
        )}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-canvas)]">
          {editorPanel}
        </main>
      </div>

      {/* Mobile: full-screen list or full-screen editor */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mainTarget || restoringFromUrl ? (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-canvas)]">
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
          onOpen={(note) => openNote(note, query)}
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
          importTextsRef={importTextsRef}
          onImportTextsClick={() => importTextsRef.current?.click()}
          onImportTexts={handleImportTexts}
          onGuestExport={handleGuestExport}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
      )}

      {infoNote && (
        <NoteInfoModal
          note={infoNote}
          onClose={() => setInfoNote(null)}
          onShare={share}
          onUnshare={unshare}
          onSetShareToken={setShareToken}
          canShare={!isGuest}
        />
      )}
    </>
  );
}
