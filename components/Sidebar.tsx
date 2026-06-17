"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewText } from "@/lib/inferTitle";
import { detectCodeLanguage, languageLabel, noteFileExtension } from "@/lib/detectLanguage";
import { ColorSwatchRow } from "@/components/ColorSwatchRow";
import { noteColorVar } from "@/lib/noteColors";
import { downloadNoteBody } from "@/lib/downloadNote";
import { SyncStatus } from "@/lib/useNotes";
import { Note } from "@/lib/types";
import {
  DotsIcon,
  KeyboardIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
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
  width,
}: {
  hydrated: boolean;
  filtered: Note[];
  activeNoteId: string | null;
  viewMode: "active" | "archive" | "trash";
  syncStatus: SyncStatus;
  onExitFilteredView: () => void;
  onOpenNote: (note: Note) => void;
  onNewNote: () => void;
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
  width?: number;
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
  }, [measure, orderKey, hydrated]);

  // Web fonts loading and sidebar resizes shift row offsets; re-measure and
  // snap (no slide) so the pill lands exactly. Mounted ONCE via a ref —
  // re-creating the observer per selection would fire its initial callback and
  // snap mid-slide, cancelling the animation.
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const snap = () => measureRef.current(false);
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
  }, []);

  return (
    <aside
      aria-label="Text sidebar"
      style={!mobile && width ? { width } : undefined}
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
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            <PlusIcon className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium">New</span>
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

      <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {indicator && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-2 right-2 top-0 rounded-md bg-[var(--color-accent)]"
            style={{
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
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              title="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[rgba(255,179,19,0.14)] hover:text-[var(--color-orange)]"
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
            >
              <KeyboardIcon className="h-4 w-4" />
            </button>
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
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

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
      data-note-id={note.id}
      className="group relative flex items-center rounded-md"
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
          className="min-w-0 flex-1 rounded bg-[var(--color-background)] px-2.5 py-1 text-sm text-[var(--color-text)] outline-none ring-1 ring-[var(--color-accent)] mx-1"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={onOpen}
            aria-current={active ? "true" : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
              active && !slidingIn
                ? "text-[var(--color-accent-fg)]"
                : "text-[var(--color-text)]"
            }`}
          >
            {noteColorVar(note.color) && (
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  active && !slidingIn ? "ring-1 ring-white/40" : ""
                }`}
                style={{ background: noteColorVar(note.color)! }}
                aria-hidden
              />
            )}
            <span className="min-w-0 flex-1 truncate">{previewText(note)}</span>
            <span
              aria-hidden
              className={`shrink-0 font-mono text-[11px] lowercase ${
                active && !slidingIn
                  ? "text-[var(--color-accent-fg)]/70"
                  : "text-[var(--color-subtle)]"
              }`}
            >
              .{noteFileExtension(note.body)}
            </span>
          </button>
          <button
            type="button"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={`mr-1 grid h-6 w-6 place-items-center rounded transition-colors focus-visible:opacity-100 ${
              active
                ? "text-white/75 hover:bg-white/20 hover:text-white"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            } ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <DotsIcon className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-1 top-7 z-20 w-44 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg"
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
                  Download
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

export function NoteInfoModal({
  note,
  onClose,
  onShare,
  onUnshare,
  onSetShareToken,
  canShare,
}: {
  note: Note;
  onClose: () => void;
  onShare?: (id: string) => Promise<string | null>;
  onUnshare?: (id: string) => Promise<void>;
  onSetShareToken?: (id: string, token: string) => Promise<string | null>;
  canShare?: boolean;
}) {
  const [token, setToken] = useState<string | null>(note.shareToken ?? null);
  const [vanity, setVanity] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = token ? `${origin}/p/${token}` : "";

  async function createShare() {
    if (!onShare) return;
    setBusy(true);
    setShareError(null);
    try {
      setToken(await onShare(note.id));
    } finally {
      setBusy(false);
    }
  }
  async function stopShare() {
    if (!onUnshare) return;
    setBusy(true);
    try {
      await onUnshare(note.id);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }
  async function saveVanity() {
    if (!onSetShareToken || !vanity.trim()) return;
    setBusy(true);
    setShareError(null);
    try {
      setToken(await onSetShareToken(note.id, vanity.trim()));
      setVanity("");
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Couldn't set that link.");
    } finally {
      setBusy(false);
    }
  }
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const chars = note.body.length;
  const bytes = new TextEncoder().encode(note.body).byteLength;
  const codeLang = detectCodeLanguage(note.body);
  const kind = codeLang
    ? languageLabel(codeLang)
    : note.markdown
    ? "Markdown"
    : "Plain text";

  function fmt(ts: number) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  }

  function fmtBytes(b: number) {
    if (b < 1024) return `${b} bytes`;
    return `${(b / 1024).toFixed(1)} KB`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Text Info"
        className="relative z-10 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Text Info
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <p className="mb-4 truncate text-sm font-medium text-[var(--color-text)]">
            {previewText(note)}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">Kind</dt>
            <dd className="text-right text-[var(--color-text)]">{kind}</dd>
            <dt className="text-[var(--color-muted)]">Created</dt>
            <dd className="text-right text-[var(--color-text)]">{fmt(note.createdAt)}</dd>
            <dt className="text-[var(--color-muted)]">Modified</dt>
            <dd className="text-right text-[var(--color-text)]">{fmt(note.updatedAt)}</dd>
            <dt className="text-[var(--color-muted)]">Words</dt>
            <dd className="text-right text-[var(--color-text)]">{words.toLocaleString()}</dd>
            <dt className="text-[var(--color-muted)]">Characters</dt>
            <dd className="text-right text-[var(--color-text)]">{chars.toLocaleString()}</dd>
            <dt className="text-[var(--color-muted)]">Size</dt>
            <dd className="text-right text-[var(--color-text)]">{fmtBytes(bytes)}</dd>
          </dl>
          {canShare && (
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <p className="text-xs font-medium text-[var(--color-text)]">Public link</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                Anyone with the link can read this text.
              </p>
              {token ? (
                <>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-text)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">
                      /p/
                    </span>
                    <input
                      value={vanity}
                      onChange={(e) => setVanity(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveVanity()}
                      placeholder="custom-link"
                      className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-text)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={saveVanity}
                      disabled={busy || !vanity.trim()}
                      className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                  {shareError && (
                    <p className="mt-1.5 text-xs text-[var(--color-danger)]">{shareError}</p>
                  )}
                  <button
                    type="button"
                    onClick={stopShare}
                    disabled={busy}
                    className="mt-2 text-xs text-[var(--color-danger)] hover:underline disabled:opacity-50"
                  >
                    Stop sharing
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={createShare}
                  disabled={busy}
                  className="mt-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
                >
                  {busy ? "Generating link…" : "Create share link"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
