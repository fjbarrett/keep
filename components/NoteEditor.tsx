"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import { Note } from "@/lib/types";
import { HighlightedEditor, HighlightedEditorHandle } from "./HighlightedEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  HistoryIcon,
  PinFilledIcon,
  PinIcon,
  ShareIcon,
  TrashIcon,
  UnarchiveIcon,
  XIcon,
} from "./Icons";

export type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; note: Note }
  | null;

const ICON_BUTTON =
  "grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]";

function iconToggle(active: boolean) {
  return active
    ? "grid h-7 w-7 place-items-center rounded-md bg-[var(--color-surface-hover)] text-[var(--color-text)]"
    : ICON_BUTTON;
}

export function NoteEditor({
  target,
  onClose,
  onBack,
  onCreate,
  onUpdate,
  onTrash,
  onRestore,
  onRemove,
  onShare,
  onUnshare,
  canShare,
  presentation = "modal",
}: {
  target: EditorTarget;
  onClose: () => void;
  onBack?: () => void;
  onCreate: (n: Partial<Note>) => Promise<Note | null>;
  onUpdate: (id: string, patch: Partial<Note>) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onShare: (id: string) => Promise<string | null>;
  onUnshare: (id: string) => Promise<void>;
  canShare: boolean;
  presentation?: "modal" | "panel";
}) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<{ id: string; body: string; title: string; createdAt: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const bodyRef = useRef<HighlightedEditorHandle>(null);
  const [highlight, setHighlight] = useState(false);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const createdIdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const targetKey =
    target?.mode === "edit" ? target.note.id : target?.mode ?? "closed";
  const isPanel = presentation === "panel";

  useEffect(() => {
    if (!target) return;
    if (target.mode === "edit") {
      // Bridging "new" → "edit" of the note we just autosaved: keep the local
      // body/pinned/archived so any keystrokes the user kept making during
      // the create round-trip aren't clobbered by the saved snapshot.
      if (createdIdRef.current === target.note.id) {
        createdIdRef.current = null;
        return;
      }
      setBody(target.note.body);
      setPinned(target.note.pinned);
      setArchived(target.note.archived);
      setHighlight(Boolean(target.note.highlight));
    } else {
      setBody("");
      setPinned(false);
      setArchived(false);
      setHighlight(false);
    }
    setDirty(false);
    setHistoryOpen(false);
    setVersions([]);
    setCopied(false);
    setCopyMenuOpen(false);
    createdIdRef.current = null;
    creatingRef.current = false;
    setTimeout(() => {
      bodyRef.current?.focus();
      plainRef.current?.focus();
    }, 30);
  }, [targetKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!target) return;
      // Defer to the search overlay when it's mounted — Escape and ⌘K belong to it.
      if (document.querySelector("[data-search-overlay]")) return;
      if (e.key === "Escape") close();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, body, pinned, archived]);

  useEffect(() => {
    if (!target || !dirty) return;
    if (target.mode === "edit") {
      const timer = window.setTimeout(() => {
        onUpdate(target.note.id, { body, pinned, archived, highlight });
        setDirty(false);
      }, 550);
      return () => window.clearTimeout(timer);
    }
    if (target.mode === "new") {
      if (createdIdRef.current) {
        const id = createdIdRef.current;
        const timer = window.setTimeout(() => {
          onUpdate(id, { body, pinned, archived, highlight });
          setDirty(false);
        }, 550);
        return () => window.clearTimeout(timer);
      }
      if (!body.trim() || creatingRef.current) return;
      const timer = window.setTimeout(async () => {
        if (createdIdRef.current || creatingRef.current) return;
        creatingRef.current = true;
        const note = await onCreate({ body, pinned, archived, highlight });
        creatingRef.current = false;
        if (note) {
          createdIdRef.current = note.id;
          setDirty(false);
        }
      }, 550);
      return () => window.clearTimeout(timer);
    }
  }, [archived, body, dirty, highlight, onCreate, onUpdate, pinned, target]);

  function markBody(value: string) {
    setBody(value);
    setDirty(true);
  }

  function togglePinned() {
    setPinned((value) => !value);
    setDirty(true);
  }

  function toggleArchived() {
    setArchived((value) => !value);
    setDirty(true);
  }

  async function loadHistory() {
    if (!target || target.mode !== "edit") return;
    try {
      const res = await fetch(`/api/notes/${target.note.id}/versions`);
      if (!res.ok) return;
      const data = await res.json();
      setVersions(data.versions ?? []);
      setHistoryOpen(true);
    } catch { /* ignore */ }
  }

  function restoreVersion(versionBody: string) {
    setBody(versionBody);
    setDirty(true);
    setHistoryOpen(false);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Upload failed");
      }
      const { url } = await res.json();
      const tag = `![${file.name}](${url})`;
      const cursor = bodyRef.current?.getCursor() ?? plainRef.current?.selectionStart ?? body.length;
      const before = body.slice(0, cursor);
      const after = body.slice(cursor);
      const sep = before && !before.endsWith("\n") ? "\n" : "";
      markBody(before + sep + tag + "\n" + after);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handlePlainPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadImage(file);
        return;
      }
    }
  }

  function handlePlainDrop(e: React.DragEvent) {
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        uploadImage(file);
        return;
      }
    }
  }

  async function copyBody() {
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setCopyMenuOpen(false);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked (insecure context, etc.) — silently no-op.
    }
  }

  async function copyFormatted() {
    if (!body.trim()) return;
    try {
      const html = await marked(body);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([body], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      setCopyMenuOpen(false);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      await copyBody();
    }
  }

  function flushEdit() {
    if (!target || target.mode !== "edit") return;
    onUpdate(target.note.id, { body, pinned, archived, highlight });
    setDirty(false);
  }

  function close() {
    if (!target) return;
    if (target.mode === "new") {
      if (createdIdRef.current) {
        onUpdate(createdIdRef.current, { body, pinned, archived, highlight });
      } else if (body.trim() && !creatingRef.current) {
        creatingRef.current = true;
        onCreate({ body, pinned, archived, highlight });
      }
    } else {
      flushEdit();
    }
    onClose();
  }

  if (!target) return null;

  const isTrashed = target.mode === "edit" && target.note.trashed;

  const header = (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-3 py-2">
      {onBack && (
        <>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to notes"
            className={`${ICON_BUTTON} md:hidden`}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="mr-1 h-4 w-px bg-[var(--color-border)] md:hidden" />
        </>
      )}
      {!isTrashed ? (
        <>
          <button
            type="button"
            onClick={() => { setHighlight((v) => !v); setPreviewOpen(false); setDirty(true); }}
            className={iconToggle(highlight)}
            title={highlight ? "Syntax highlighting on" : "Syntax highlighting"}
            aria-label="Syntax highlighting"
            aria-pressed={highlight}
          >
            <span className="font-mono text-[11px] tracking-tight">
              {"</>"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setPreviewOpen((v) => !v); setHighlight(false); setDirty(true); }}
            className={iconToggle(previewOpen)}
            title={previewOpen ? "Edit" : "Preview markdown"}
            aria-label={previewOpen ? "Edit" : "Preview markdown"}
            aria-pressed={previewOpen}
          >
            <span className="font-mono text-[11px] font-semibold tracking-tight">
              md
            </span>
          </button>
          {target.mode === "edit" && (
            <button
              type="button"
              onClick={loadHistory}
              className={iconToggle(historyOpen)}
              title="Version history"
              aria-label="Version history"
            >
              <HistoryIcon className="h-4 w-4" />
            </button>
          )}
        </>
      ) : (
        <span className="px-1 text-xs font-medium text-[var(--color-muted)]">
          In Trash
        </span>
      )}

      <div className="flex-1" />

      {!isTrashed ? (
        <>
          <button
            type="button"
            onClick={togglePinned}
            className={iconToggle(pinned)}
            title={pinned ? "Unpin" : "Pin"}
            aria-label={pinned ? "Unpin" : "Pin"}
            aria-pressed={pinned}
          >
            {pinned ? (
              <PinFilledIcon className="h-4 w-4" />
            ) : (
              <PinIcon className="h-4 w-4" />
            )}
          </button>
          {body.trim() && (
            previewOpen ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCopyMenuOpen((v) => !v)}
                  className={ICON_BUTTON}
                  title={copied ? "Copied" : "Copy note"}
                  aria-label={copied ? "Copied" : "Copy note"}
                  aria-haspopup="menu"
                  aria-expanded={copyMenuOpen}
                >
                  {copied ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                </button>
                {copyMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setCopyMenuOpen(false)} />
                    <div
                      role="menu"
                      className="absolute right-0 top-8 z-20 min-w-[168px] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => copyBody()}
                        className="block w-full px-3 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                      >
                        Copy Markdown
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={copyFormatted}
                        className="block w-full px-3 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                      >
                        Copy Formatted
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={copyBody}
                className={ICON_BUTTON}
                title={copied ? "Copied" : "Copy note"}
                aria-label={copied ? "Copied" : "Copy note"}
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </button>
            )
          )}
          {target.mode === "edit" && canShare && (
            <SharePopover
              note={target.note}
              onShare={() => onShare(target.note.id)}
              onUnshare={() => onUnshare(target.note.id)}
            />
          )}
          {target.mode === "edit" && (
            <>
              <button
                type="button"
                onClick={toggleArchived}
                className={ICON_BUTTON}
                title={archived ? "Unarchive" : "Archive"}
                aria-label={archived ? "Unarchive" : "Archive"}
              >
                {archived ? (
                  <UnarchiveIcon className="h-4 w-4" />
                ) : (
                  <ArchiveIcon className="h-4 w-4" />
                )}
              </button>
              <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
              <button
                type="button"
                onClick={() => {
                  flushEdit();
                  onTrash(target.note.id);
                  if (!isPanel) onClose();
                }}
                className={`${ICON_BUTTON} hover:text-[var(--color-danger)]`}
                title="Move to Trash"
                aria-label="Move to Trash"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          {body.trim() && (
            <button
              type="button"
              onClick={copyBody}
              className={ICON_BUTTON}
              title={copied ? "Copied" : "Copy note"}
              aria-label={copied ? "Copied" : "Copy note"}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              flushEdit();
              onRestore(target.note.id);
              if (!isPanel) onClose();
            }}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <UnarchiveIcon className="h-3.5 w-3.5" />
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Permanently delete this note?")) {
                onRemove(target.note.id);
                onClose();
              }
            }}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete forever
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className={ICON_BUTTON}
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const editor = (
    <>
        {!historyOpen && header}

        {historyOpen ? (
          <VersionHistory
            versions={versions}
            currentBody={body}
            onRestore={restoreVersion}
            onClose={() => setHistoryOpen(false)}
          />
        ) : (
          <div className="relative flex flex-col min-h-0 flex-1 py-4">
            {previewOpen ? (
              <MarkdownPreview body={body} />
            ) : highlight ? (
              <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col px-6">
                <HighlightedEditor
                  ref={bodyRef}
                  value={body}
                  onChange={markBody}
                  onPaste={handlePlainPaste}
                  onDrop={handlePlainDrop}
                  placeholderText="Start writing..."
                />
              </div>
            ) : (
              <textarea
                ref={plainRef}
                value={body}
                onChange={(e) => markBody(e.target.value)}
                onPaste={handlePlainPaste}
                onDrop={handlePlainDrop}
                placeholder="Start writing..."
                name="note-body"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                className="min-h-[320px] w-full max-w-3xl flex-1 resize-none overflow-y-auto border-0 bg-transparent px-6 text-base md:text-sm leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
              />
            )}
            {uploading && (
              <p className="absolute bottom-3 left-4 text-xs text-[var(--color-muted)] animate-pulse">
                Uploading image...
              </p>
            )}
          </div>
        )}

    </>
  );

  if (presentation === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {editor}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      <div className="relative z-10 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {editor}
      </div>
    </div>
  );
}

function VersionHistory({
  versions,
  currentBody,
  onRestore,
  onClose,
}: {
  versions: { id: string; body: string; title: string; createdAt: number }[];
  currentBody: string;
  onRestore: (body: string) => void;
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const header = (
    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        aria-label="Back to editor"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back
      </button>
      <span className="text-sm font-medium text-[var(--color-text)]">
        Version history
      </span>
    </div>
  );

  if (versions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
          No previous versions yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <ul className="flex-1 divide-y divide-[var(--color-border)] overflow-y-auto">
        {versions.map((v, i) => {
          const expanded = expandedId === v.id;
          const newerBody = i === 0 ? currentBody : versions[i - 1].body;
          return (
            <li key={v.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : v.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {v.title || "Untitled"}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onRestore(v.body)}
                  className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs font-medium text-[var(--color-link)] hover:bg-[var(--color-surface-hover)]"
                >
                  Restore
                </button>
              </div>
              {expanded ? (
                <DiffView oldText={v.body} newText={newerBody} />
              ) : (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-muted)]">
                  {v.body.slice(0, 200)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const maxLen = Math.max(oldLines.length, newLines.length);
  const diffLines: { type: "same" | "add" | "remove"; text: string }[] = [];

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  for (const line of oldLines) {
    if (!newSet.has(line)) {
      diffLines.push({ type: "remove", text: line });
    }
  }
  for (const line of newLines) {
    if (!oldSet.has(line)) {
      diffLines.push({ type: "add", text: line });
    }
  }

  if (diffLines.length === 0) {
    return (
      <p className="mt-2 text-xs text-[var(--color-muted)]">No changes</p>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] font-mono text-xs">
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap px-3 py-0.5 ${
            line.type === "add"
              ? "bg-[var(--color-diff-add-bg)] text-[var(--color-diff-add)]"
              : line.type === "remove"
                ? "bg-[var(--color-diff-remove-bg)] text-[var(--color-diff-remove)]"
                : "text-[var(--color-muted)]"
          }`}
        >
          <span className="mr-2 inline-block w-3 select-none text-right opacity-60">
            {line.type === "add" ? "+" : "−"}
          </span>
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}

function SharePopover({
  note,
  onShare,
  onUnshare,
}: {
  note: Note;
  onShare: () => Promise<string | null>;
  onUnshare: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isShared = !!note.shareToken;
  const url =
    note.shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/p/${note.shareToken}`
      : "";

  async function handleClick() {
    setOpen((v) => !v);
    if (!isShared && !busy) {
      setBusy(true);
      await onShare();
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function handleUnshare() {
    setBusy(true);
    await onUnshare();
    setBusy(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className={
          isShared
            ? "grid h-7 w-7 place-items-center rounded-md text-[var(--color-accent)] transition-colors hover:bg-[var(--color-surface-hover)]"
            : ICON_BUTTON
        }
        title={isShared ? "Shared — manage link" : "Share"}
        aria-label={isShared ? "Shared — manage link" : "Share"}
      >
        <ShareIcon className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
            <p className="text-xs font-medium text-[var(--color-text)]">
              Public link
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Anyone with the link can read this note.
            </p>
            {url ? (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-text)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                {busy ? "Generating link..." : "No link yet."}
              </p>
            )}
            {isShared && (
              <button
                type="button"
                onClick={handleUnshare}
                disabled={busy}
                className="mt-2 text-xs text-[var(--color-danger)] hover:underline disabled:opacity-50"
              >
                Stop sharing
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

