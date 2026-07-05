"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import { Note } from "@/lib/types";
import { HighlightedEditor, HighlightedEditorHandle } from "./HighlightedEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { renderSearchHits } from "./renderSearchHits";
import { ColorSwatchRow } from "./ColorSwatchRow";
import { noteColorVar } from "@/lib/noteColors";
import { noteFileExtension } from "@/lib/detectLanguage";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  DotsIcon,
  DownloadIcon,
  PinFilledIcon,
  PinIcon,
  TrashIcon,
  UnarchiveIcon,
  XIcon,
} from "./Icons";

export type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; note: Note; highlightQuery?: string }
  | null;

const ICON_BUTTON =
  "grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]";

// Text metrics for the plain editor. The search backdrop mirrors the textarea
// pixel-for-pixel, so both must share these classes or match boxes drift.
const PLAIN_METRICS = "px-6 sm:px-10 text-base leading-7";

function formatEdited(ts: number) {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

function iconToggle(active: boolean) {
  return active
    ? "grid h-8 w-8 place-items-center rounded-md bg-[var(--color-surface-hover)] text-[var(--color-text)]"
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
  const [copied, setCopied] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const bodyRef = useRef<HighlightedEditorHandle>(null);
  const [highlight, setHighlight] = useState(false);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const createdIdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  // Search highlighting: when a note is opened from search, paint a yellow box
  // on every match and let Tab cycle through them (see the plain-editor overlay).
  const [findQuery, setFindQuery] = useState<string | null>(null);
  const [findActive, setFindActive] = useState(0);
  const matches = useMemo<[number, number][]>(() => {
    const q = findQuery?.toLowerCase();
    if (!q) return [];
    const hay = body.toLowerCase();
    const out: [number, number][] = [];
    for (let i = hay.indexOf(q); i !== -1; i = hay.indexOf(q, i + q.length)) {
      out.push([i, i + q.length]);
    }
    return out;
  }, [body, findQuery]);
  const targetKey =
    target?.mode === "edit"
      ? `${target.note.id}${target.highlightQuery ? `:q:${target.highlightQuery}` : ""}`
      : target?.mode ?? "closed";
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
    setCopied(false);
    setCopyMenuOpen(false);
    setColorMenuOpen(false);
    createdIdRef.current = null;
    creatingRef.current = false;
    const query =
      target.mode === "edit" ? target.highlightQuery?.trim() : undefined;
    const matchAt =
      query && target.mode === "edit"
        ? target.note.body.toLowerCase().indexOf(query.toLowerCase())
        : -1;
    if (query && matchAt >= 0) {
      setFindQuery(query);
      setFindActive(0);
    } else {
      setFindQuery(null);
    }
    setTimeout(() => {
      // The editor is reused across notes, so it keeps the previous note's
      // caret/scroll. Three open behaviours:
      //  - from search: focus and select the match so it's highlighted in view;
      //  - a new note: focus so the user can type immediately;
      //  - opening an existing note: don't grab focus — no blinking cursor or
      //    stray selection. The user clicks into the body to place the caret.
      const ta = scrollRef.current?.querySelector("textarea");
      if (ta && query && matchAt >= 0) {
        // Focus with the caret at the match (no native selection — the yellow
        // overlay is the highlight). preventScroll so the focus doesn't fight
        // the scroll-to-active effect, which positions the first match.
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(matchAt, matchAt);
      } else if (target.mode === "new") {
        bodyRef.current?.focus();
        plainRef.current?.focus();
        if (ta) ta.selectionStart = ta.selectionEnd = 0;
      } else if (ta) {
        ta.selectionStart = ta.selectionEnd = 0;
        ta.blur();
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      }
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

  // Bring the active match into view whenever it changes (open, or Tab cycle).
  useEffect(() => {
    if (!findQuery || matches.length === 0) return;
    scrollRef.current
      ?.querySelector<HTMLElement>("[data-search-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [findQuery, findActive, matches.length]);

  // While a search is live, Tab / Shift+Tab step through matches instead of
  // moving focus. Capture phase so it beats the textarea's default.
  useEffect(() => {
    if (!findQuery || matches.length === 0) return;
    function onTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      e.preventDefault();
      e.stopPropagation();
      setFindActive((i) =>
        e.shiftKey
          ? (i - 1 + matches.length) % matches.length
          : (i + 1) % matches.length,
      );
    }
    window.addEventListener("keydown", onTab, true);
    return () => window.removeEventListener("keydown", onTab, true);
  }, [findQuery, matches.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!target) return;
      // Defer to the search overlay when it's mounted — Escape and ⌘K belong to it.
      if (document.querySelector("[data-search-overlay]")) return;
      if (e.key === "Escape") {
        // First Escape clears the search highlight; a second one closes.
        if (findQuery) {
          e.preventDefault();
          setFindQuery(null);
          return;
        }
        close();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, body, pinned, archived, findQuery]);

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
    // Editing ends the search session (matches would shift out from under it).
    if (findQuery) setFindQuery(null);
  }

  function togglePinned() {
    setPinned((value) => !value);
    setDirty(true);
  }

  function toggleArchived() {
    setArchived((value) => !value);
    setDirty(true);
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

  function focusBodyEnd(e: React.MouseEvent) {
    // Clicking the empty canvas around or below the text drops the caret at
    // the end, like native notes apps. Only direct hits on the canvas — child
    // clicks (the textarea itself, the preview) keep their own behaviour.
    if (e.target !== e.currentTarget) return;
    const ta = scrollRef.current?.querySelector("textarea");
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  const header = (
    <div className="mx-auto flex w-full max-w-3xl xl:max-w-4xl shrink-0 flex-wrap items-center gap-1 border-b border-[var(--color-border-muted)] px-4 py-2">
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
      {isTrashed && (
        <span className="px-1 text-xs font-medium text-[var(--color-muted)]">
          In Trash
        </span>
      )}

      <div className="flex-1" />

      {!isTrashed ? (
        <>
          {actionsOpen && (
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
          <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
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
          )}
          <button
            type="button"
            onClick={() =>
              setActionsOpen((v) => {
                if (v) {
                  setColorMenuOpen(false);
                  setCopyMenuOpen(false);
                }
                return !v;
              })
            }
            className={iconToggle(actionsOpen)}
            title={actionsOpen ? "Hide actions" : "More actions"}
            aria-label={actionsOpen ? "Hide actions" : "More actions"}
            aria-expanded={actionsOpen}
          >
            <DotsIcon className="h-4 w-4" />
          </button>
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
        {header}

        <div
          ref={scrollRef}
          onClick={focusBodyEnd}
          className={`relative min-h-0 overflow-y-auto pt-5 pb-8 ${previewOpen ? "" : "cursor-text"}`}
        >
            {target.mode === "edit" && (
              <p className="mb-4 select-none text-center text-xs text-[var(--color-subtle)]">
                Edited {formatEdited(target.note.updatedAt)}
              </p>
            )}
            {previewOpen ? (
              <MarkdownPreview
                body={body}
                query={findQuery}
                activeMatch={findActive}
              />
            ) : highlight ? (
              <div className="mx-auto flex min-h-0 w-full max-w-3xl xl:max-w-4xl flex-col pl-3 pr-6">
                <HighlightedEditor
                  ref={bodyRef}
                  value={body}
                  onChange={markBody}
                  onPaste={handlePlainPaste}
                  onDrop={handlePlainDrop}
                  placeholderText="Start writing..."
                  searchMatches={findQuery ? matches : null}
                  activeMatch={findActive}
                />
              </div>
            ) : (
              <div className="relative mx-auto min-h-[32rem] w-full max-w-2xl">
                {findQuery && matches.length > 0 && (
                  <div
                    aria-hidden
                    className={`search-backdrop pointer-events-none absolute inset-0 select-none whitespace-pre-wrap break-words ${PLAIN_METRICS}`}
                  >
                    {renderSearchHits(body, matches, findActive)}
                  </div>
                )}
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
                  className={`relative block min-h-[32rem] w-full resize-none overflow-hidden border-0 bg-transparent caret-[var(--color-accent)] text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none ${PLAIN_METRICS}`}
                />
              </div>
            )}
            {uploading && (
              <p className="absolute bottom-3 left-4 text-xs text-[var(--color-muted)] animate-pulse">
                Uploading image...
              </p>
            )}
          </div>

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
