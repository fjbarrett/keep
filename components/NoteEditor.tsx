"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { Note } from "@/lib/types";
import {
  ArchiveIcon,
  HistoryIcon,
  PinFilledIcon,
  PinIcon,
  ShareIcon,
  TagIcon,
  TrashIcon,
  UnarchiveIcon,
  XIcon,
} from "./Icons";

export type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; note: Note }
  | null;

export function NoteEditor({
  target,
  onClose,
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
  const [markdown, setMarkdown] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<{ id: string; body: string; title: string; createdAt: number }[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
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
      setMarkdown(Boolean(target.note.markdown));
      setTags(target.note.tags ?? []);
    } else {
      setBody("");
      setPinned(false);
      setArchived(false);
      setMarkdown(false);
      setTags([]);
    }
    setTagInput("");
    setTagOpen(false);
    setDirty(false);
    setHistoryOpen(false);
    setVersions([]);
    createdIdRef.current = null;
    creatingRef.current = false;
    setTimeout(() => {
      bodyRef.current?.focus();
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
  }, [target, body, pinned, archived, markdown]);

  useEffect(() => {
    if (!target || !dirty) return;
    if (target.mode === "edit") {
      const timer = window.setTimeout(() => {
        onUpdate(target.note.id, { body, pinned, archived, markdown, tags });
        setDirty(false);
      }, 550);
      return () => window.clearTimeout(timer);
    }
    if (target.mode === "new") {
      if (createdIdRef.current) {
        const id = createdIdRef.current;
        const timer = window.setTimeout(() => {
          onUpdate(id, { body, pinned, archived, markdown, tags });
          setDirty(false);
        }, 550);
        return () => window.clearTimeout(timer);
      }
      if (!body.trim() || creatingRef.current) return;
      const timer = window.setTimeout(async () => {
        if (createdIdRef.current || creatingRef.current) return;
        creatingRef.current = true;
        const note = await onCreate({ body, pinned, archived, markdown, tags });
        creatingRef.current = false;
        if (note) {
          createdIdRef.current = note.id;
          setDirty(false);
        }
      }, 550);
      return () => window.clearTimeout(timer);
    }
  }, [archived, body, dirty, markdown, onCreate, onUpdate, pinned, tags, target]);

  const displayTitle = useMemo(() => {
    // Mirror the sidebar so the two never drift: prefer the saved title,
    // fall back to local inference only when the saved one is stale.
    // In "new" mode there's no saved row yet, so infer straight from the
    // editor's local body so the header tracks each keystroke just like
    // the sidebar preview does.
    if (!target || target.mode !== "edit") {
      return body.trim() ? inferNoteTitle(body) : "New note";
    }
    const saved = target.note.title;
    // Prefer the live body so the header keeps pace with typing instead of
    // lagging behind autosave.
    if (needsInferredTitle(saved, body)) {
      return inferNoteTitle(body || saved) || "Untitled";
    }
    return saved || "Untitled";
  }, [target, body]);

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

  function toggleMarkdown() {
    setMarkdown((value) => !value);
    setDirty(true);
  }

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput("");
    setDirty(true);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
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
      const ta = bodyRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const before = body.slice(0, start);
        const after = body.slice(ta.selectionEnd);
        const sep = before && !before.endsWith("\n") ? "\n" : "";
        markBody(before + sep + tag + "\n" + after);
      } else {
        markBody(body + (body ? "\n" : "") + tag + "\n");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
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

  function handleDrop(e: React.DragEvent) {
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

  function flushEdit() {
    if (!target || target.mode !== "edit") return;
    onUpdate(target.note.id, { body, pinned, archived, markdown, tags });
    setDirty(false);
  }

  function close() {
    if (!target) return;
    if (target.mode === "new") {
      if (createdIdRef.current) {
        onUpdate(createdIdRef.current, { body, pinned, archived, markdown, tags });
      } else if (body.trim() && !creatingRef.current) {
        creatingRef.current = true;
        onCreate({ body, pinned, archived, markdown, tags });
      }
    } else {
      flushEdit();
    }
    onClose();
  }

  if (!target) return null;

  const editor = (
    <>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">
              {displayTitle}
            </p>
            {target.mode === "edit" && (
              <p className="font-mono text-[10px] text-[var(--color-muted)]">
                {dirty ? "Saving..." : `#${target.note.id.slice(-6)}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {target.mode !== "edit" || !target.note.trashed ? (
              <>
                <button
                  type="button"
                  onClick={() => setTagOpen((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
                    tags.length > 0 || tagOpen
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-muted)]"
                  }`}
                  title="Tags"
                >
                  <TagIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={toggleMarkdown}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
                    markdown
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-muted)]"
                  }`}
                  title={markdown ? "Markdown on" : "Render this note as Markdown when shared"}
                  aria-pressed={markdown}
                >
                  <span className="font-mono text-[11px] tracking-tight">
                    md
                  </span>
                </button>
                {target.mode === "edit" && (
                  <button
                    type="button"
                    onClick={loadHistory}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
                      historyOpen
                        ? "text-[var(--color-text)]"
                        : "text-[var(--color-muted)]"
                    }`}
                    title="Version history"
                  >
                    <HistoryIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={togglePinned}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-surface-hover)] ${
                    pinned
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-muted)]"
                  }`}
                  title={pinned ? "Unpin" : "Pin"}
                >
                  {pinned ? (
                    <PinFilledIcon className="h-3.5 w-3.5" />
                  ) : (
                    <PinIcon className="h-3.5 w-3.5" />
                  )}
                  {pinned ? "Pinned" : "Pin"}
                </button>
              </>
            ) : null}
            {!isPanel && (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus-ring"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {(tags.length > 0 || tagOpen) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-4 py-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-hover)] px-2 py-0.5 text-xs text-[var(--color-text)]"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  aria-label={`Remove tag ${tag}`}
                >
                  <XIcon className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {tagOpen && (
              <input
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                  if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                    removeTag(tags[tags.length - 1]);
                  }
                  if (e.key === "Escape") {
                    setTagOpen(false);
                    setTagInput("");
                  }
                }}
                onBlur={() => {
                  if (tagInput.trim()) addTag(tagInput);
                  setTagOpen(false);
                }}
                placeholder="Add tag..."
                className="min-w-[80px] flex-1 border-0 bg-transparent text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
              />
            )}
          </div>
        )}

        {historyOpen ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {versions.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                No previous versions yet
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {versions.map((v) => (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-text)]">
                          {v.title || "Untitled"}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {new Date(v.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => restoreVersion(v.body)}
                        className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                      >
                        Restore
                      </button>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-muted)]">
                      {v.body.slice(0, 200)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 px-4 py-4">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => markBody(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              placeholder="Start writing..."
              rows={Math.max(6, Math.min(20, body.split("\n").length + 2))}
              className="min-h-[320px] w-full flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none"
            />
            {uploading && (
              <p className="absolute bottom-3 left-4 text-xs text-[var(--color-muted)] animate-pulse">
                Uploading image...
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5">
          {target.mode === "edit" && target.note.trashed && (
            <span className="mr-auto text-xs text-[var(--color-muted)]">
              In Trash
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {target.mode === "edit" && target.note.trashed && (
              <>
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
              </>
            )}
            {target.mode === "edit" && !target.note.trashed && canShare && (
              <SharePopover
                note={target.note}
                onShare={() => onShare(target.note.id)}
                onUnshare={() => onUnshare(target.note.id)}
              />
            )}
            {target.mode === "edit" && !target.note.trashed && (
              <>
                <button
                  type="button"
                  onClick={toggleArchived}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
                  title={archived ? "Unarchive" : "Archive"}
                >
                  {archived ? (
                    <UnarchiveIcon className="h-3.5 w-3.5" />
                  ) : (
                    <ArchiveIcon className="h-3.5 w-3.5" />
                  )}
                  {archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    flushEdit();
                    onTrash(target.note.id);
                    if (!isPanel) onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Move to Trash
                </button>
              </>
            )}
          </div>
        </div>
    </>
  );

  if (presentation === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
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
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
          isShared
            ? "border-[var(--color-accent-border)] bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
        }`}
      >
        <ShareIcon className="h-3.5 w-3.5" />
        {isShared ? "Shared" : "Share"}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full right-0 z-20 mb-1 w-80 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
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
