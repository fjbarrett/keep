"use client";

import { useMemo, useState } from "react";
import { previewText } from "@/lib/inferTitle";
import { SyncStatus } from "@/lib/useNotes";
import { Note } from "@/lib/types";
import {
  DotsIcon,
  PinFilledIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "@/components/Icons";

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
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  onRename,
  onInfo,
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
  togglePin: (id: string) => void;
  toggleArchive: (id: string) => void;
  trash: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onInfo: (note: Note) => void;
  mobile?: boolean;
  width?: number;
}) {
  const buckets = bucketByDate(filtered);
  const filteredTitle =
    viewMode === "archive" ? "Archive" : viewMode === "trash" ? "Trash" : null;

  return (
    <aside
      aria-label="Notes sidebar"
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
          <span className="font-medium">New note</span>
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
                    onRename={(title) => onRename(note.id, title)}
                    onInfo={() => onInfo(note)}
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
  onOpen,
  trashMode,
  togglePin,
  toggleArchive,
  trash,
  restore,
  remove,
  onRename,
  onInfo,
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
  onRename: (title: string) => void;
  onInfo: () => void;
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
      className={`group relative flex items-center rounded-md ${
        active ? "bg-[var(--color-surface-hover)]" : "hover:bg-[var(--color-surface-hover)]"
      }`}
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
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className={`mr-1 grid h-6 w-6 place-items-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:opacity-100 ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
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
                <MenuItem onClick={startRename}>Rename</MenuItem>
                <div className="my-1 border-t border-[var(--color-border)]" />
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
}: {
  note: Note;
  onClose: () => void;
}) {
  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const chars = note.body.length;
  const bytes = new TextEncoder().encode(note.body).byteLength;

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
        aria-label="Note Info"
        className="relative z-10 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Note Info
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
        <div className="p-4">
          <p className="mb-4 truncate text-sm font-medium text-[var(--color-text)]">
            {previewText(note)}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">Kind</dt>
            <dd className="text-right text-[var(--color-text)]">
              {note.markdown ? "Markdown" : "Plain text"}
            </dd>
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
        </div>
      </div>
    </div>
  );
}
