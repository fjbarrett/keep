"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import { Note } from "@/lib/types";
import { HighlightedEditor, HighlightedEditorHandle } from "./HighlightedEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { NoteEditorToolbar } from "./NoteEditorToolbar";
import { renderSearchHits } from "./renderSearchHits";
import { noteColorVar } from "@/lib/noteColors";
import { useAutohideScrollbar } from "@/lib/useAutohideScrollbar";
import { useModalDialog } from "@/lib/useModalDialog";
import { noteFileExtension } from "@/lib/detectLanguage";

export type EditorTarget =
  | { mode: "new" }
  | { mode: "edit"; note: Note; highlightQuery?: string; autoFocus?: boolean }
  | null;

// Text metrics for the plain editor. The search backdrop mirrors the textarea
// pixel-for-pixel, so both must share these classes or match boxes drift.
const PLAIN_METRICS = "px-6 sm:px-10 text-[15px] leading-[26px]";

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
  onRename,
  presentation = "modal",
}: {
  target: EditorTarget;
  onClose: () => void;
  onBack?: () => void;
  onCreate: (n: Partial<Note>) => Promise<Note | null>;
  onUpdate: (id: string, patch: Partial<Note>) => Promise<void>;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onColor?: (color: string | null) => void;
  onRename?: (title: string) => void;
  presentation?: "modal" | "panel";
}) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HighlightedEditorHandle>(null);
  const [highlight, setHighlight] = useState(false);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevPanelHeightRef = useRef(0);
  useAutohideScrollbar(scrollRef);
  const createdIdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const draftRef = useRef({ body, pinned, archived, markdown: previewOpen, highlight });
  draftRef.current = { body, pinned, archived, markdown: previewOpen, highlight };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const startCreate = useCallback(
    async (
      draft: {
        body: string;
        pinned: boolean;
        archived: boolean;
        markdown: boolean;
        highlight: boolean;
      },
      submittedRevision: number,
    ) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      try {
        const note = await onCreate(draft);
        if (!note) return;
        createdIdRef.current = note.id;

        const latestRevision = revisionRef.current;
        if (latestRevision !== submittedRevision) {
          await onUpdate(note.id, draftRef.current);
          if (mountedRef.current && revisionRef.current === latestRevision) {
            setDirty(false);
          }
        } else if (mountedRef.current) {
          setDirty(false);
        }
      } finally {
        creatingRef.current = false;
      }
    },
    [onCreate, onUpdate],
  );
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
  const modalRef = useModalDialog(close, !isPanel && Boolean(target));
  const editNote = target?.mode === "edit" ? target.note : null;

  // Pin/archive can change outside the editor (sidebar menu, keyboard
  // shortcuts) while an edit is pending. The draft snapshots both flags, so
  // resync them or the next autosave flush writes the stale values back.
  // Separate effects so an external archive can't revert an unflushed pin.
  useEffect(() => {
    if (editNote) setPinned(editNote.pinned);
  }, [editNote?.pinned]);
  useEffect(() => {
    if (editNote) setArchived(editNote.archived);
  }, [editNote?.archived]);

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
      setPreviewOpen(Boolean(target.note.markdown));
      setHighlight(Boolean(target.note.highlight));
    } else {
      setBody("");
      setPinned(false);
      setArchived(false);
      setPreviewOpen(false);
      setHighlight(false);
    }
    setDirty(false);
    setCopied(false);
    createdIdRef.current = null;
    creatingRef.current = false;
    revisionRef.current = 0;
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
      //  - opening an existing note: focus with the caret at the very start,
      //    ready to type without clicking in — unless the open came from a
      //    session restore or keyboard navigation (autoFocus: false), where
      //    grabbing focus would swallow the shortcut keys.
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
        if (target.autoFocus !== false) {
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(0, 0);
        }
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      }
    }, 30);
  }, [targetKey]);

  // Grow the plain editor to fit its content so short notes hug the text and
  // the box expands as lines are added (the highlight editor self-sizes).
  // Layout effect so the card's height is final before the FLIP below reads it.
  useLayoutEffect(() => {
    const ta = plainRef.current;
    if (!ta || highlight || previewOpen) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [body, highlight, previewOpen, targetKey]);

  // Switching notes snaps the content-hugging card to the new note's size;
  // FLIP the height between the two so the border glides instead of jumping.
  // The switch lands across two commits — targetKey changes first, the new
  // body/highlight state a commit later — so mark the switch here and animate
  // below on the commit where the content (and thus the height) actually moves.
  const switchFlipRef = useRef(false);
  // Matches the initial body state, so the mount commit doesn't count as a
  // content change but the commit where the opened note's body lands does.
  const lastFadeBodyRef = useRef("");
  // False until the first content commit: opening from the grid fades the text
  // in but keeps the card at its natural size — only later switches resize.
  const openedRef = useRef(false);
  useLayoutEffect(() => {
    switchFlipRef.current = true;
    const t = window.setTimeout(() => {
      switchFlipRef.current = false;
    }, 400);
    return () => window.clearTimeout(t);
  }, [targetKey]);

  useLayoutEffect(() => {
    const contentChanged = body !== lastFadeBodyRef.current;
    lastFadeBodyRef.current = body;
    if (!switchFlipRef.current || !contentChanged) return;
    switchFlipRef.current = false;
    const el = panelRef.current;
    if (!el) return;
    el.getAnimations?.().forEach((a) => {
      if (a.id === "panel-flip") a.cancel();
    });
    // The incoming text fades up from the background while the card resizes.
    scrollRef.current?.animate?.(
      [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }],
      { duration: 300, easing: "ease-out" },
    );
    const firstOpen = !openedRef.current;
    openedRef.current = true;
    const prev = prevPanelHeightRef.current;
    const next = el.offsetHeight;
    if (!firstOpen && prev > 0 && Math.abs(prev - next) > 2) {
      if (!el.animate) {
        prevPanelHeightRef.current = next;
        return;
      }
      const anim = el.animate(
        [{ height: `${prev}px` }, { height: `${next}px` }],
        { duration: 260, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
      );
      anim.id = "panel-flip";
      anim.onfinish = () => {
        prevPanelHeightRef.current = el.offsetHeight;
      };
    }
  }, [body, highlight, previewOpen, targetKey]);

  // Track the card's resting height for the next FLIP — but not while one is
  // mid-flight, when offsetHeight reports the animation's keyframe value.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (el.getAnimations?.().some((a) => a.id === "panel-flip")) return;
    prevPanelHeightRef.current = el.offsetHeight;
  });

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
      const submittedRevision = revisionRef.current;
      const timer = window.setTimeout(() => {
        void Promise.resolve(onUpdate(target.note.id, draftRef.current)).then(() => {
          if (mountedRef.current && revisionRef.current === submittedRevision) {
            setDirty(false);
          }
        });
      }, 550);
      return () => window.clearTimeout(timer);
    }
    if (target.mode === "new") {
      if (createdIdRef.current) {
        const id = createdIdRef.current;
        const submittedRevision = revisionRef.current;
        const timer = window.setTimeout(() => {
          void Promise.resolve(onUpdate(id, draftRef.current)).then(() => {
            if (mountedRef.current && revisionRef.current === submittedRevision) {
              setDirty(false);
            }
          });
        }, 550);
        return () => window.clearTimeout(timer);
      }
      if (!body.trim() || creatingRef.current) return;
      const submittedRevision = revisionRef.current;
      const timer = window.setTimeout(() => {
        if (createdIdRef.current || creatingRef.current) return;
        void startCreate(draftRef.current, submittedRevision);
      }, 550);
      return () => window.clearTimeout(timer);
    }
  }, [archived, body, dirty, highlight, onUpdate, pinned, previewOpen, startCreate, target]);

  function markBody(value: string) {
    revisionRef.current += 1;
    setBody(value);
    setDirty(true);
    // Editing ends the search session (matches would shift out from under it).
    if (findQuery) setFindQuery(null);
  }

  function togglePinned() {
    revisionRef.current += 1;
    setPinned((value) => !value);
    setDirty(true);
  }

  function toggleArchived() {
    revisionRef.current += 1;
    setArchived((value) => !value);
    setDirty(true);
  }

  function toggleHighlightMode() {
    revisionRef.current += 1;
    setHighlight((value) => !value);
    setPreviewOpen(false);
    setDirty(true);
  }

  function toggleMarkdownPreview() {
    revisionRef.current += 1;
    setPreviewOpen((value) => !value);
    setHighlight(false);
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
    if (!target || target.mode !== "edit" || !dirty) return;
    void onUpdate(target.note.id, draftRef.current);
  }

  function close() {
    if (!target) return;
    if (target.mode === "new") {
      if (createdIdRef.current && dirty) {
        void onUpdate(createdIdRef.current, draftRef.current);
      } else if (body.trim() && !creatingRef.current) {
        void startCreate(draftRef.current, revisionRef.current);
      }
    } else {
      flushEdit();
    }
    onClose();
  }

  if (!target) return null;

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
    <NoteEditorToolbar
      target={target}
      body={body}
      pinned={pinned}
      archived={archived}
      highlight={highlight}
      previewOpen={previewOpen}
      copied={copied}
      isPanel={isPanel}
      onBack={onBack}
      onRename={onRename}
      onColor={onColor}
      onToggleHighlight={toggleHighlightMode}
      onToggleMarkdownPreview={toggleMarkdownPreview}
      onTogglePinned={togglePinned}
      onCopyBody={copyBody}
      onCopyFormatted={copyFormatted}
      onDownload={downloadNote}
      onToggleArchived={toggleArchived}
      onFlush={flushEdit}
      onTrash={onTrash}
      onRestore={onRestore}
      onRemove={onRemove}
      onDismiss={onClose}
      onRequestClose={close}
    />
  );

  const editor = (
    <>
        {header}

        <div
          ref={scrollRef}
          onClick={focusBodyEnd}
          className={`autohide-scrollbar relative min-h-0 overflow-y-auto pt-5 pb-8 ${previewOpen ? "" : "cursor-text"}`}
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
              <div className="relative mx-auto w-full max-w-2xl">
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
                  className={`relative block min-h-40 w-full resize-none overflow-hidden border-0 bg-transparent caret-[var(--color-accent)] text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none ${PLAIN_METRICS}`}
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
      // The card hugs the note: width matches the text column and height is
      // content-driven, so the 2px outline alone marks the margins and the
      // bottom edge — the fill matches the canvas so the page doesn't read
      // as a lighter sheet. Highlight mode widens for code.
      <div
        ref={panelRef}
        className={`mx-auto flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-canvas)] transition-[max-width,border-color] duration-300 ${
          highlight && !previewOpen ? "max-w-3xl xl:max-w-4xl" : "max-w-2xl"
        }`}
        style={
          target.mode === "edit"
            ? { borderColor: noteColorVar(target.note.color) ?? undefined }
            : undefined
        }
      >
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

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Note editor"
        tabIndex={-1}
        className="relative z-10 flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        {editor}
      </div>
    </div>
  );
}
