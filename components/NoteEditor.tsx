"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import { Note } from "@/lib/types";
import { HighlightedEditor, HighlightedEditorHandle } from "./HighlightedEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { ColorSwatchRow } from "./ColorSwatchRow";
import { noteColorVar } from "@/lib/noteColors";
import { noteFileExtension } from "@/lib/detectLanguage";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  HistoryIcon,
  PinFilledIcon,
  PinIcon,
  TrashIcon,
  UnarchiveIcon,
  XIcon,
} from "./Icons";

export type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; note: Note }
  | null;

const ICON_BUTTON =
  "grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]";

function iconToggle(active: boolean) {
  return active
    ? "grid h-8 w-8 place-items-center rounded-md bg-[var(--color-surface-hover)] text-[var(--color-text)]"
    : ICON_BUTTON;
}

// A segment inside the macOS-style view-mode control: no individual rounding
// (the bordered container clips it), filled when active.
function segmentButton(active: boolean) {
  return `grid h-8 w-9 place-items-center transition-colors ${
    active
      ? "bg-[var(--color-surface-hover)] text-[var(--color-text)]"
      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
  }`;
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
  onColor,
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
  onColor?: (color: string | null) => void;
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
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const bodyRef = useRef<HighlightedEditorHandle>(null);
  const [highlight, setHighlight] = useState(false);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    setColorMenuOpen(false);
    createdIdRef.current = null;
    creatingRef.current = false;
    setTimeout(() => {
      bodyRef.current?.focus();
      plainRef.current?.focus();
      // The editor is reused across notes, so it keeps the previous note's
      // caret/scroll. Reset to the top so a note always opens at its start.
      const ta = scrollRef.current?.querySelector("textarea");
      if (ta) ta.selectionStart = ta.selectionEnd = 0;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, 30);
  }, [targetKey]);

  // Grow the plain editor to fit its content so short notes hug the text and
  // the box expands as lines are added (the highlight editor self-sizes).
  useEffect(() => {
    const ta = plainRef.current;
    if (!ta || highlight || previewOpen) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [body, highlight, previewOpen, targetKey]);

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

  function downloadNote() {
    if (!body.trim()) return;
    const ext = noteFileExtension(body);
    const first = body.split("\n").find((l) => l.trim()) ?? "note";
    const base =
      first.replace(/^#{1,6}\s+/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 50) ||
      "note";
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="mx-auto flex w-full max-w-3xl xl:max-w-4xl shrink-0 flex-wrap items-center gap-1 px-3 py-2">
      {onBack && (
        <>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to texts"
            className={`${ICON_BUTTON} md:hidden`}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <div className="mr-1 h-4 w-px bg-[var(--color-border)] md:hidden" />
        </>
      )}
      {!isTrashed ? (
        <>
          <div className="flex items-center overflow-hidden rounded-md border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => { setHighlight((v) => !v); setPreviewOpen(false); setDirty(true); }}
              className={segmentButton(highlight)}
              title={highlight ? "Syntax highlighting on" : "Syntax highlighting"}
              aria-label="Syntax highlighting"
              aria-pressed={highlight}
            >
              <span className="font-mono text-[11px] tracking-tight">
                {"</>"}
              </span>
            </button>
            <div className="h-5 w-px bg-[var(--color-border)]" />
            <button
              type="button"
              onClick={() => { setPreviewOpen((v) => !v); setHighlight(false); setDirty(true); }}
              className={segmentButton(previewOpen)}
              title={previewOpen ? "Edit" : "Preview markdown"}
              aria-label={previewOpen ? "Edit" : "Preview markdown"}
              aria-pressed={previewOpen}
            >
              <span className="font-mono text-[11px] font-semibold tracking-tight">
                md
              </span>
            </button>
          </div>
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
          {target.mode === "edit" && onColor && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setColorMenuOpen((v) => !v)}
                className={ICON_BUTTON}
                title="Color label"
                aria-label="Color label"
                aria-haspopup="menu"
                aria-expanded={colorMenuOpen}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full border border-[var(--color-border)]"
                  style={{ background: noteColorVar(target.note.color) ?? "transparent" }}
                />
              </button>
              {colorMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColorMenuOpen(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 top-8 z-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
                  >
                    <ColorSwatchRow
                      selected={target.note.color ?? null}
                      onPick={(color) => {
                        onColor(color);
                        setColorMenuOpen(false);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {body.trim() && (
            previewOpen ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCopyMenuOpen((v) => !v)}
                  className={ICON_BUTTON}
                  title={copied ? "Copied" : "Copy text"}
                  aria-label={copied ? "Copied" : "Copy text"}
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
                title={copied ? "Copied" : "Copy text"}
                aria-label={copied ? "Copied" : "Copy text"}
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </button>
            )
          )}
          {body.trim() && (
            <button
              type="button"
              onClick={downloadNote}
              className={ICON_BUTTON}
              title="Download text"
              aria-label="Download text"
            >
              <DownloadIcon className="h-4 w-4" />
            </button>
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
              title={copied ? "Copied" : "Copy text"}
              aria-label={copied ? "Copied" : "Copy text"}
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
              if (confirm("Permanently delete this text?")) {
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
          <div ref={scrollRef} className="relative min-h-0 overflow-y-auto pt-6 pb-4">
            {previewOpen ? (
              <MarkdownPreview body={body} />
            ) : highlight ? (
              <div className="mx-auto flex min-h-0 w-full max-w-3xl xl:max-w-4xl flex-col pl-3 pr-6">
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
                autoCorrect="on"
                autoCapitalize="sentences"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                data-form-type="other"
                className="mx-auto min-h-[32rem] w-full max-w-3xl xl:max-w-4xl resize-none overflow-hidden border-0 bg-transparent px-6 text-[15px] leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
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
      // The note surface tracks the body/controls column width (same
      // max-w-3xl→xl:max-w-4xl), so the background shrinks to hug the note and
      // centers on the canvas instead of spanning the whole pane.
      <div className="mx-auto flex max-h-full min-h-0 w-full max-w-3xl xl:max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
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

      <div className="relative z-10 flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
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
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [descLoading, setDescLoading] = useState<Set<string>>(new Set());
  const [showRawDiffId, setShowRawDiffId] = useState<string | null>(null);

  function wordDelta(older: string, newer: string) {
    const d =
      newer.trim().split(/\s+/).filter(Boolean).length -
      older.trim().split(/\s+/).filter(Boolean).length;
    if (d === 0) return null;
    return d > 0 ? `+${d} words` : `${d} words`;
  }

  async function fetchDescription(id: string, oldBody: string, newBody: string) {
    if (descriptions[id] !== undefined || descLoading.has(id)) return;
    setDescLoading((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/notes/describe-diff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldBody, newBody }),
      });
      const data = res.ok ? await res.json() : null;
      setDescriptions((prev) => ({
        ...prev,
        [id]: data?.description ?? "Unable to describe changes.",
      }));
    } catch {
      setDescriptions((prev) => ({
        ...prev,
        [id]: "Unable to describe changes.",
      }));
    } finally {
      setDescLoading((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

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
          const delta = wordDelta(v.body, newerBody);
          const description = descriptions[v.id];
          const loading = descLoading.has(v.id);
          const showRaw = showRawDiffId === v.id;
          return (
            <li key={v.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = expanded ? null : v.id;
                    setExpandedId(next);
                    if (next) fetchDescription(next, v.body, newerBody);
                  }}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">
                    {v.title || "Untitled"}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    {new Date(v.createdAt).toLocaleString()}
                    {delta && (
                      <span
                        className={
                          delta.startsWith("+")
                            ? "text-[var(--color-diff-add)]"
                            : "text-[var(--color-diff-remove)]"
                        }
                      >
                        {delta}
                      </span>
                    )}
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
              {expanded && (
                <div className="mt-2 space-y-2">
                  {loading ? (
                    <p className="animate-pulse text-xs text-[var(--color-muted)]">
                      Describing changes…
                    </p>
                  ) : (
                    <p className="text-xs leading-relaxed text-[var(--color-text)]">
                      {description}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRawDiffId(showRaw ? null : v.id)}
                    className="text-xs text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-text)] hover:underline"
                  >
                    {showRaw ? "Hide diff" : "Show diff"}
                  </button>
                  {showRaw && <DiffView oldText={v.body} newText={newerBody} />}
                </div>
              )}
              {!expanded && (
                <p className="mt-1 line-clamp-1 text-xs text-[var(--color-muted)]">
                  {v.body.slice(0, 120)}
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
  const oldSet = new Set(oldText.split("\n"));
  const newSet = new Set(newText.split("\n"));
  const diffLines: { type: "add" | "remove"; text: string }[] = [
    ...oldText.split("\n").filter((l) => !newSet.has(l)).map((text) => ({ type: "remove" as const, text })),
    ...newText.split("\n").filter((l) => !oldSet.has(l)).map((text) => ({ type: "add" as const, text })),
  ];

  if (diffLines.length === 0) {
    return <p className="text-xs text-[var(--color-muted)]">No line-level changes</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-background)] font-mono text-xs">
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap px-3 py-0.5 ${
            line.type === "add"
              ? "bg-[var(--color-diff-add-bg)] text-[var(--color-diff-add)]"
              : "bg-[var(--color-diff-remove-bg)] text-[var(--color-diff-remove)]"
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
