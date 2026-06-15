"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";
import { searchableText } from "@/lib/inferTitle";
import { useNotes } from "@/lib/useNotes";
import { useEncryption } from "@/lib/useEncryption";
import { isEncrypted } from "@/lib/crypto";
import { Note } from "@/lib/types";
import { NoteEditor, EditorTarget } from "@/components/NoteEditor";
import { Sidebar, NoteInfoModal } from "@/components/Sidebar";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SettingsPane } from "@/components/SettingsPane";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import { EncryptionSetup } from "@/components/EncryptionSetup";
import { EncryptionUnlock } from "@/components/EncryptionUnlock";
import { NotesCardGrid } from "@/components/NotesCardGrid";
import { PlusIcon, StackIcon, XIcon } from "@/components/Icons";

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

  const { status: encStatus, unlock, setupEncryption, disableEncryption, encrypt, decrypt } = useEncryption();
  const [encSetupOpen, setEncSetupOpen] = useState(false);
  const [decryptedState, setDecryptedState] = useState<Note[]>([]);
  // When encryption is unlocked we work off the decrypted copies; otherwise the
  // raw notes are already usable (plaintext, or ciphertext we can't read yet).
  // Deriving rather than mirroring into state avoids a one-render lag that used
  // to briefly deselect a freshly created note.
  const decryptedNotes = encStatus === "unlocked" ? decryptedState : notes;

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
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [infoNote, setInfoNote] = useState<Note | null>(null);
  // True while a /note/<id> deep link is still resolving — keeps the main pane
  // blank instead of flashing the grid/placeholder before the note opens.
  const [restoringFromUrl, setRestoringFromUrl] = useState(!!initialNoteId);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const didRestoreFromUrlRef = useRef(false);
  // Id of the note created from the current compose session. Lets the editor's
  // entrance-animation key stay stable across the new → edit autosave bridge so
  // the editor isn't remounted (which would discard in-flight keystrokes).
  const composedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = parseInt(localStorage.getItem("keep.sidebarWidth") ?? "", 10);
    if (!isNaN(stored)) setSidebarWidth(stored);
  }, []);

  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const w = Math.min(400, Math.max(160, startWidth + ev.clientX - startX));
      setSidebarWidth(w);
    }
    function onUp(ev: MouseEvent) {
      const w = Math.min(400, Math.max(160, startWidth + ev.clientX - startX));
      localStorage.setItem("keep.sidebarWidth", String(w));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
    const viewFiltered = decryptedNotes
      .filter((n) => {
        if (viewMode === "trash") return n.trashed;
        if (viewMode === "archive") return n.archived && !n.trashed;
        return !n.archived && !n.trashed;
      });
    if (!q) return viewFiltered.sort((a, b) => b.updatedAt - a.updatedAt);
    const fuse = new Fuse(viewFiltered, {
      keys: [
        { name: "title", getFn: (n: Note) => searchableText(n) },
        "body",
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
    return fuse.search(q).map((r) => r.item);
  }, [decryptedNotes, query, searchOpen, viewMode]);

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

  function openNote(note: Note | null) {
    if (!note) return;
    composedIdRef.current = null;
    setSearchOpen(false);
    setQuery("");
    setActiveNoteId(note.id);
    setTarget({ mode: "edit", note });
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

  // Decrypt all note bodies once the key is unlocked. Notes without an "enc:"
  // prefix pass through unchanged (legacy or unencrypted notes). When not
  // unlocked, decryptedNotes derives straight from `notes` (see above).
  useEffect(() => {
    if (encStatus !== "unlocked") return;
    let cancelled = false;
    Promise.all(notes.map(async (n) => ({ ...n, body: await decrypt(n.body) }))).then(
      (result) => { if (!cancelled) setDecryptedState(result); },
    );
    return () => { cancelled = true; };
  }, [notes, decrypt, encStatus]);

  // Wraps the raw update call to encrypt the body before it leaves the browser.
  const secureUpdate = useCallback(
    (id: string, patch: Partial<Note>) => {
      if (patch.body === undefined || encStatus !== "unlocked" || isEncrypted(patch.body)) {
        update(id, patch);
        return;
      }
      encrypt(patch.body).then((encrypted) => update(id, { ...patch, body: encrypted }));
    },
    [encStatus, encrypt, update],
  );

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
    if (localStorage.getItem("keep.shortcutsSeen")) return;
    const timer = window.setTimeout(() => setShortcutsOpen(true), 800);
    return () => window.clearTimeout(timer);
  }, []);

  function closeShortcuts() {
    localStorage.setItem("keep.shortcutsSeen", "1");
    setShortcutsOpen(false);
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
    if (didRestoreFromUrlRef.current) return;
    if (!initialNoteId) {
      didRestoreFromUrlRef.current = true;
      setRestoringFromUrl(false);
      // Show the notes grid on load rather than auto-opening a new editor
      return;
    }
    // Keep the blank restoring shell up until notes have loaded; only then
    // decide whether the deep-linked note opens or we fall back to the grid.
    if (!hydrated) return;
    const note = decryptedNotes.find((n) => n.id === initialNoteId);
    if (!note && notes.length === 0) return;
    didRestoreFromUrlRef.current = true;
    setRestoringFromUrl(false);
    if (note) {
      setActiveNoteId(note.id);
      setTarget({ mode: "edit", note });
    }
  }, [hydrated, decryptedNotes, notes.length, initialNoteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = target?.mode === "edit" ? target.note.id : null;
    const desired = id ? `/note/${id}` : "/";
    if (window.location.pathname === desired) return;
    window.history.replaceState(null, "", desired + window.location.search);
  }, [target]);

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

      // ⌘I — Get Info for the active note (Mac "Get Info" muscle memory).
      if ((event.metaKey || event.ctrlKey) && key === "i") {
        event.preventDefault();
        if (activeNote) setInfoNote(activeNote);
        return;
      }

      // ⌘/ (and ⌘?) toggles the shortcuts sheet even while typing.
      if ((event.metaKey || event.ctrlKey) && (key === "/" || event.key === "?")) {
        event.preventDefault();
        if (shortcutsOpen) closeShortcuts();
        else setShortcutsOpen(true);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Bare "?" opens the sheet whenever the user isn't typing in a field —
      // including when a note is open (which previously swallowed it).
      if (!typing && (event.key === "?" || (event.shiftKey && key === "/"))) {
        event.preventDefault();
        if (shortcutsOpen) closeShortcuts();
        else setShortcutsOpen(true);
        return;
      }

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
  }, [activeNote, activeNoteId, remove, searchOpen, shortcutsOpen, target, toggleArchive, togglePin, trash, visibleNotes]);

  const mainTarget: EditorTarget =
    target?.mode === "edit"
      ? {
          mode: "edit",
          note: decryptedNotes.find((n) => n.id === target.note.id) ?? target.note,
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
    onOpenSettings: () => setSettingsOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
    togglePin,
    toggleArchive,
    trash,
    restore,
    remove,
    onRename: (id: string, title: string) => update(id, { title }),
    onInfo: (note: Note) => setInfoNote(note),
  };

  // A new note and the edit view of the note it just autosaved into share one
  // key ("compose") so the editor isn't remounted between them; switching to a
  // different note changes the key and replays the entrance animation.
  const animKey = !mainTarget
    ? "grid"
    : mainTarget.mode === "new" || mainTarget.note.id === composedIdRef.current
      ? "compose"
      : `note-${mainTarget.note.id}`;

  const editorPanel = (
    <>
      {error && (
        <div className="px-6 pt-4">
          <DbError error={error} onRetry={refresh} />
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
        key={animKey}
        className="note-content-in flex min-h-0 flex-1 flex-col p-4"
      >
        {mainTarget ? (
          <NoteEditor
            target={mainTarget}
            onClose={() => setTarget(null)}
            onBack={() => setTarget(null)}
            onCreate={handleCreate}
            onUpdate={secureUpdate}
            onTrash={trash}
            onRestore={restore}
            onRemove={remove}
            onShare={share}
            onUnshare={unshare}
            canShare={!isGuest}
            presentation="panel"
          />
        ) : restoringFromUrl ? (
          <div className="flex-1" aria-hidden />
        ) : filtered.length > 0 ? (
          <div className="overflow-y-auto">
            <NotesCardGrid notes={filtered} onOpen={openNote} onTogglePin={togglePin} />
          </div>
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
        <Sidebar {...sidebarProps} width={sidebarWidth} />
        <div
          onMouseDown={startSidebarResize}
          className="w-[3px] shrink-0 cursor-col-resize bg-[var(--color-border)] opacity-0 transition-opacity hover:opacity-100"
          aria-hidden
        />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
          {editorPanel}
        </main>
      </div>

      {/* Mobile: full-screen list or full-screen editor */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mainTarget || restoringFromUrl ? (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-background)]">
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
          encStatus={encStatus}
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
          onEnableEncryption={() => setEncSetupOpen(true)}
          onDisableEncryption={disableEncryption}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {encSetupOpen && (
        <EncryptionSetup
          onSetup={async (passphrase) => {
            await setupEncryption(passphrase);
            setEncSetupOpen(false);
          }}
          onClose={() => setEncSetupOpen(false)}
        />
      )}

      {encStatus === "locked" && (
        <EncryptionUnlock onUnlock={unlock} />
      )}

      {shortcutsOpen && (
        <ShortcutsOverlay onClose={closeShortcuts} />
      )}

      {infoNote && (
        <NoteInfoModal note={infoNote} onClose={() => setInfoNote(null)} />
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
  onDismiss,
}: {
  isGuest: boolean;
  hasLocalNotes: boolean;
  onSave: () => Promise<{ saved: number }>;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
      <p className="text-sm text-[var(--color-muted)]">
        {hasLocalNotes
          ? "Some notes are saved only in this browser."
          : "These notes are saved only in this browser."}
      </p>
      <div className="flex items-center gap-1.5">
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
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
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
    <div className="flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
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
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <StackIcon className="h-5 w-5 text-[var(--color-muted)]" />
        </div>
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
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          or press{" "}
          <kbd className="inline-block min-w-[20px] rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-center font-mono text-[11px]">
            n
          </kbd>
        </p>
      </div>
    </div>
  );
}
