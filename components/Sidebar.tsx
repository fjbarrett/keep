"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewText, TITLE_CHAR_LIMIT } from "@/lib/inferTitle";
import { noteFileExtension } from "@/lib/detectLanguage";
import { ColorSwatchRow } from "@/components/ColorSwatchRow";
import { noteColorVar } from "@/lib/noteColors";
import { downloadNoteBody, downloadNotePdf } from "@/lib/downloadNote";
import { SyncStatus } from "@/lib/useNotes";
import { useMenuPresence } from "@/lib/useMenuPresence";
import { Note } from "@/lib/types";
import {
  DotsIcon,
  KeyboardIcon,
  PanelLeftIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "@/components/Icons";

type DateBucket = { label: string; notes: Note[] };

function bucketByDate(notes: Note[]): DateBucket[] {
  // Pinned (non-trashed) notes float into their own section at the very top.
  const pinned = notes.filter((n) => n.pinned && !n.trashed);
  const rest = notes.filter((n) => !(n.pinned && !n.trashed));
  const dated = bucketDatedNotes(rest);
  return pinned.length ? [{ label: "Pinned", notes: pinned }, ...dated] : dated;
}

function bucketDatedNotes(notes: Note[]): DateBucket[] {
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

// Keep in sync with the indicator's transform transition duration in the JSX.
const SELECTION_SLIDE_MS = 300;

export function Sidebar({
  hydrated,
  filtered,
  activeNoteId,
  viewMode,
  syncStatus,
  onExitFilteredView,
  onOpenNote,
  onNewNote,
  onOpenSearch,
  onOpenSettings,
  onOpenShortcuts,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  onRename,
  onInfo,
  onColor,
  onCollapse,
  mobile,
}: {
  hydrated: boolean;
  filtered: Note[];
  activeNoteId: string | null;
  viewMode: "active" | "archive" | "trash";
  syncStatus: SyncStatus;
  onExitFilteredView: () => void;
  onOpenNote: (note: Note) => void;
  onNewNote: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  trash: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onInfo: (note: Note) => void;
  onColor: (id: string, color: string | null) => void;
  onCollapse?: () => void;
  mobile?: boolean;
}) {
  const buckets = bucketByDate(filtered);
  const filteredTitle =
    viewMode === "archive" ? "Archive" : viewMode === "trash" ? "Trash" : null;

  // A single accent highlight that springs up/down to the active row, instead
  // of each row painting its own background.
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<
    { top: number; height: number; animate: boolean } | null
  >(null);
  const orderKey = useMemo(() => filtered.map((n) => n.id).join(","), [filtered]);

  // The selection pill is driven by a local id so it starts sliding on click,
  // before the editor swaps. The editor content swap (onOpenNote) is deferred
  // until the slide finishes; meanwhile the clicked row keeps its hover
  // highlight so it doesn't look empty mid-slide. A timeout (not transitionend)
  // is used so the open always fires even if no transition runs.
  const [pillId, setPillId] = useState<string | null>(activeNoteId);
  const [sliding, setSliding] = useState(false);
  const pendingTimer = useRef<number | null>(null);

  // The list scrollbar is hidden; a bottom fade is the only hint that more rows
  // sit below the fold, so show it whenever the list isn't scrolled to the end.
  const [showBottomFade, setShowBottomFade] = useState(false);
  const updateFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setShowBottomFade(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);

  // Follow external active changes (keyboard nav, deep links, deferred open).
  useEffect(() => {
    setPillId(activeNoteId);
  }, [activeNoteId]);

  useEffect(
    () => () => {
      if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
    },
    [],
  );

  const selectNote = useCallback(
    (note: Note) => {
      if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
      if (note.id === pillId) {
        onOpenNote(note);
        return;
      }
      const willSlide = pillId != null;
      setPillId(note.id);
      if (!willSlide) {
        onOpenNote(note); // nothing to slide from on the first selection
        return;
      }
      setSliding(true);
      pendingTimer.current = window.setTimeout(() => {
        setSliding(false);
        pendingTimer.current = null;
        onOpenNote(note);
      }, SELECTION_SLIDE_MS);
    },
    [pillId, onOpenNote],
  );

  const measure = useCallback(
    (animateOnChange: boolean) => {
      const container = listRef.current;
      const row =
        container && pillId
          ? container.querySelector<HTMLElement>(
              `[data-note-id="${CSS.escape(pillId)}"]`,
            )
          : null;
      if (!row) {
        setIndicator(null);
        return;
      }
      const top = row.offsetTop;
      const height = row.offsetHeight;
      setIndicator((prev) =>
        prev && prev.top === top && prev.height === height
          ? prev
          : { top, height, animate: animateOnChange && prev != null },
      );
    },
    [pillId],
  );

  // A user selection (or the list reordering) springs the highlight into place.
  useEffect(() => {
    measure(true);
    updateFade();
  }, [measure, updateFade, orderKey, hydrated]);

  // Web fonts loading and sidebar resizes shift row offsets; re-measure and
  // snap (no slide) so the pill lands exactly. Mounted ONCE via a ref —
  // re-creating the observer per selection would fire its initial callback and
  // snap mid-slide, cancelling the animation.
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const snap = () => {
      measureRef.current(false);
      updateFade();
    };
    const ro = new ResizeObserver(snap);
    ro.observe(container);
    let cancelled = false;
    // On first paint the selected row's geometry isn't settled yet (web-font
    // swap, scrollbar appearing), so the initial snap can land a few px off and
    // stay there until the next selection re-measures. Re-snap on the next
    // frame and once fonts are ready so the pill lands exactly on load without
    // needing a manual reselect.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!cancelled) snap();
      }),
    );
    document.fonts?.ready?.then(() => {
      requestAnimationFrame(() => {
        if (!cancelled) snap();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [updateFade]);

  return (
    <aside
      aria-label="Text sidebar"
      className={
        mobile
          ? "flex h-full w-full flex-col bg-[var(--color-canvas)]"
          : "hidden h-full w-[260px] shrink-0 flex-col bg-[var(--color-canvas)] md:flex"
      }
    >
      <div className="flex flex-col gap-1 p-2">
        <button
          type="button"
          onClick={onNewNote}
          className="new-button flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            <PlusIcon className="new-plus h-3.5 w-3.5" />
          </span>
          <span className="font-medium">New</span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            <SearchIcon className="h-3.5 w-3.5" />
          </span>
          <span>Search</span>
        </button>
      </div>

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
            Back to texts
          </button>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={updateFade}
        className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {indicator && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-2 right-2 top-0 rounded-md bg-[var(--color-accent)]"
            style={{
              background:
                noteColorVar(filtered.find((n) => n.id === pillId)?.color) ??
                undefined,
              height: indicator.height,
              transform: `translateY(${indicator.top}px)`,
              transition: indicator.animate
                ? "transform 300ms cubic-bezier(0.33, 1, 0.68, 1), height 160ms ease"
                : "none",
              willChange: "transform",
            }}
          />
        )}
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
            {filteredTitle ? `${filteredTitle} is empty.` : "No texts."}
          </p>
        ) : (
          buckets.map((bucket, i) => (
            // Tie the first section's tighter top margin to the data index, not
            // CSS `:first-child` — the absolutely-positioned selection pill is
            // also a child of this container, so once it mounts the first
            // section stops matching `:first-child` and its margin jumps
            // mt-2→mt-3 (4px). That shifts the row the pill just measured,
            // leaving the pill 4px high until the next selection re-measures.
            <section key={bucket.label} className={i === 0 ? "mt-2" : "mt-3"}>
              <h3 className="px-2.5 pb-1 text-xs font-medium text-[var(--color-muted)]">
                {bucket.label}
              </h3>
              <ul>
                {bucket.notes.map((note) => (
                  <SidebarNoteRow
                    key={note.id}
                    note={note}
                    active={note.id === pillId}
                    slidingIn={sliding && note.id === pillId}
                    onOpen={() => selectNote(note)}
                    trashMode={note.trashed}
                    togglePin={() => togglePin(note.id)}
                    toggleArchive={() => toggleArchive(note.id)}
                    trash={() => trash(note.id)}
                    restore={() => restore(note.id)}
                    remove={() => remove(note.id)}
                    onRename={(title) => onRename(note.id, title)}
                    onInfo={() => onInfo(note)}
                    onColor={(color) => onColor(note.id, color)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
        {/* Pinned to the list's bottom edge (sticky + negative margin so it adds
            no layout height); fades in only when more rows sit below the fold. */}
        <div
          aria-hidden
          className={`pointer-events-none sticky bottom-0 -mt-10 h-10 bg-gradient-to-t from-[var(--color-canvas)] to-transparent transition-opacity duration-200 ${
            showBottomFade ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="p-2">
        <div className="flex items-center justify-between px-2.5 py-1">
          <SyncIndicator status={syncStatus} />
          <div className="flex items-center gap-0.5">
            {onCollapse && !mobile && (
              <button
                type="button"
                onClick={onCollapse}
                className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSettings}
              className={
                mobile
                  ? "flex h-10 items-center gap-2 rounded-md px-2.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  : "grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              }
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
              {mobile && <span className="text-sm">Settings</span>}
            </button>
            {!mobile && (
              <button
                type="button"
                onClick={onOpenShortcuts}
                className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[rgba(255,179,19,0.14)] hover:text-[var(--color-orange)]"
                title="Keyboard shortcuts"
                aria-label="Keyboard shortcuts"
              >
                <KeyboardIcon className="h-4 w-4" />
              </button>
            )}
          </div>
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
    <span className={`flex items-center gap-1.5 text-xs ${config.color}`} role="status" aria-live="polite">
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
  slidingIn,
  onOpen,
  trashMode,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  onRename,
  onInfo,
  onColor,
}: {
  note: Note;
  active: boolean;
  slidingIn: boolean;
  onOpen: () => void;
  trashMode: boolean;
  togglePin: () => void;
  toggleArchive: () => void;
  trash: () => void;
  restore: () => void;
  remove: () => void;
  onRename: (title: string) => void;
  onInfo: () => void;
  onColor: (color: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { mounted: menuMounted, closing: menuClosing } = useMenuPresence(menuOpen);
  const [flipUp, setFlipUp] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const rowRef = useRef<HTMLLIElement>(null);

  // Open the options menu, flipping it above the row when there isn't enough
  // room below (rows near the bottom of the list would otherwise clip it).
  function openMenu() {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedMenuHeight = trashMode ? 150 : 300;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setFlipUp(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
    }
    setMenuOpen(true);
  }

  function startRename() {
    setRenameValue(previewText(note));
    setIsRenaming(true);
    setMenuOpen(false);
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(trimmed);
    setIsRenaming(false);
  }

  return (
    <li
      ref={rowRef}
      data-note-id={note.id}
      className="group relative flex items-center rounded-md"
      onContextMenu={(e) => {
        if (isRenaming) return;
        e.preventDefault();
        openMenu();
      }}
    >
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
            if (e.key === "Escape") setIsRenaming(false);
          }}
          onBlur={commitRename}
          onFocus={(e) => e.target.select()}
          maxLength={TITLE_CHAR_LIMIT}
          className="min-w-0 flex-1 rounded bg-[var(--color-background)] px-2.5 py-1 text-sm text-[var(--color-text)] outline-none ring-1 ring-[var(--color-accent)] mx-1"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={(e) => {
              // Finder-style: a fresh click opens the note; clicking the row
              // that's already selected renames it. e.detail === 1 skips the
              // second hit of a fast double-click so habitual double-clicks
              // don't trip a rename.
              if (active && !trashMode && e.detail === 1) {
                startRename();
              } else {
                onOpen();
              }
            }}
            aria-current={active ? "true" : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
              active && !slidingIn
                ? "text-[var(--color-accent-fg)]"
                : "text-[var(--color-text)]"
            }`}
          >
            {noteColorVar(note.color) && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    active && !slidingIn ? "#fff" : noteColorVar(note.color)!,
                }}
                aria-hidden
              />
            )}
            <span className="min-w-0 flex-1 truncate">{previewText(note)}</span>
          </button>
          {/* Kebab opens the row's options menu. Hidden until the row is
              hovered (or the menu is open / the button is focused for keyboard
              nav); on touch, long-press still fires the context menu. */}
          <button
            type="button"
            aria-label="Note options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              if (menuOpen) setMenuOpen(false);
              else openMenu();
            }}
            className={`mr-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-md transition-opacity ${
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            } ${
              active && !slidingIn
                ? "text-[var(--color-accent-fg)]/70 hover:text-[var(--color-accent-fg)]"
                : "text-[var(--color-subtle)] hover:text-[var(--color-text)]"
            }`}
          >
            <DotsIcon className="h-4 w-4" />
          </button>
        </>
      )}
      {menuMounted && (
        <>
          {menuOpen && (
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
          )}
          <div
            role="menu"
            data-closing={menuClosing || undefined}
            className={`menu-pop absolute right-1 z-20 w-44 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg ${
              flipUp ? "bottom-7 origin-bottom-right" : "top-7 origin-top-right"
            }`}
          >
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
                  onClick={() => {
                    onInfo();
                    setMenuOpen(false);
                  }}
                >
                  Get Info
                </MenuItem>
                <div className="my-1 border-t border-[var(--color-border)]" />
                <MenuItem
                  danger
                  onClick={() => {
                    if (confirm("Permanently delete this text?")) remove();
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
                <MenuItem onClick={startRename}>Rename</MenuItem>
                <ColorSwatchRow
                  selected={note.color ?? null}
                  onPick={(color) => {
                    onColor(color);
                    setMenuOpen(false);
                  }}
                />
                <div className="my-1 border-t border-[var(--color-border)]" />
                <MenuItem
                  onClick={() => {
                    onInfo();
                    setMenuOpen(false);
                  }}
                >
                  Get Info
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    downloadNoteBody(note.body);
                    setMenuOpen(false);
                  }}
                >
                  Download as .{noteFileExtension(note.body)}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    downloadNotePdf(note.body);
                    setMenuOpen(false);
                  }}
                >
                  Download as PDF
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
      role="menuitem"
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
