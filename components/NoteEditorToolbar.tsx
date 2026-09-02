"use client";

import { useEffect, useRef, useState } from "react";
import { ColorSwatchRow } from "@/components/ColorSwatchRow";
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
} from "@/components/Icons";
import type { EditorTarget } from "@/components/NoteEditor";
import { previewText, TITLE_CHAR_LIMIT } from "@/lib/inferTitle";
import { noteColorVar } from "@/lib/noteColors";

const ICON_BUTTON =
  "grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]";

function iconToggle(active: boolean) {
  return active
    ? "grid h-8 w-8 place-items-center rounded-md bg-[var(--color-surface-hover)] text-[var(--color-text)]"
    : ICON_BUTTON;
}

export function NoteEditorToolbar({
  target,
  body,
  pinned,
  archived,
  highlight,
  previewOpen,
  copied,
  isPanel,
  onBack,
  onRename,
  onColor,
  onToggleHighlight,
  onToggleMarkdownPreview,
  onTogglePinned,
  onCopyBody,
  onCopyFormatted,
  onDownload,
  onToggleArchived,
  onFlush,
  onTrash,
  onRestore,
  onRemove,
  onDismiss,
  onRequestClose,
}: {
  target: NonNullable<EditorTarget>;
  body: string;
  pinned: boolean;
  archived: boolean;
  highlight: boolean;
  previewOpen: boolean;
  copied: boolean;
  isPanel: boolean;
  onBack?: () => void;
  onRename?: (title: string) => void;
  onColor?: (color: string | null) => void;
  onToggleHighlight: () => void;
  onToggleMarkdownPreview: () => void;
  onTogglePinned: () => void;
  onCopyBody: () => Promise<void>;
  onCopyFormatted: () => Promise<void>;
  onDownload: () => void;
  onToggleArchived: () => void;
  onFlush: () => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (id: string) => void;
  onDismiss: () => void;
  onRequestClose: () => void;
}) {
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const cancelTitleEditRef = useRef(false);
  const targetId = target.mode === "edit" ? target.note.id : "new";

  useEffect(() => {
    setCopyMenuOpen(false);
    setColorMenuOpen(false);
    setActionsOpen(false);
    setTitleEditing(false);
  }, [targetId]);

  const isTrashed = target.mode === "edit" && target.note.trashed;
  const displayTitle = previewText({
    title: target.mode === "edit" ? target.note.title : "",
    body,
  });
  const shownTitle = body.trim() ? displayTitle : "";

  function commitTitle() {
    if (target.mode !== "edit" || !onRename) return;
    const next = titleDraft.trim();
    if (next !== shownTitle) onRename(next);
  }

  return (
    <div className="relative mx-auto flex w-full max-w-3xl shrink-0 flex-wrap items-center gap-1 border-b border-[var(--color-border-muted)] px-4 py-2 xl:max-w-4xl">
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
      {!actionsOpen &&
        (target.mode === "edit" && onRename && !isTrashed ? (
          <input
            value={titleEditing ? titleDraft : shownTitle}
            onFocus={() => {
              cancelTitleEditRef.current = false;
              setTitleEditing(true);
              setTitleDraft(shownTitle);
            }}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => {
              setTitleEditing(false);
              if (!cancelTitleEditRef.current) commitTitle();
              cancelTitleEditRef.current = false;
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                cancelTitleEditRef.current = true;
                setTitleDraft(shownTitle);
                event.currentTarget.blur();
              }
            }}
            aria-label="Note title"
            maxLength={TITLE_CHAR_LIMIT}
            className="absolute left-1/2 w-[50%] -translate-x-1/2 truncate border-0 bg-transparent text-center text-sm font-medium text-[var(--color-text)] focus:outline-none"
          />
        ) : (
          <p className="pointer-events-none absolute left-1/2 max-w-[50%] -translate-x-1/2 truncate text-sm font-medium text-[var(--color-text)]">
            {shownTitle}
          </p>
        ))}
      <div className="flex-1" />
      {isTrashed && (
        <span className="shrink-0 px-1 text-xs font-medium text-[var(--color-muted)]">
          In Trash
        </span>
      )}

      {!isTrashed ? (
        <>
          {actionsOpen && (
            <>
              <button
                type="button"
                onClick={onToggleHighlight}
                className={iconToggle(highlight)}
                title={highlight ? "Syntax highlighting on" : "Syntax highlighting"}
                aria-label="Syntax highlighting"
                aria-pressed={highlight}
              >
                <span className="font-mono text-[11px] tracking-tight">{"</>"}</span>
              </button>
              <button
                type="button"
                onClick={onToggleMarkdownPreview}
                className={iconToggle(previewOpen)}
                title={previewOpen ? "Edit" : "Preview markdown"}
                aria-label={previewOpen ? "Edit" : "Preview markdown"}
                aria-pressed={previewOpen}
              >
                <span className="font-mono text-[11px] font-semibold tracking-tight">md</span>
              </button>
              <div className="mx-1 h-4 w-px bg-[var(--color-border)]" />
              <button
                type="button"
                onClick={onTogglePinned}
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
                    onClick={() => setColorMenuOpen((value) => !value)}
                    className={ICON_BUTTON}
                    title="Color label"
                    aria-label="Color label"
                    aria-haspopup="menu"
                    aria-expanded={colorMenuOpen}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-[var(--color-border)]"
                      style={{
                        background: noteColorVar(target.note.color) ?? "transparent",
                      }}
                    />
                  </button>
                  {colorMenuOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Close color menu"
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setColorMenuOpen(false)}
                      />
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
              {body.trim() &&
                (previewOpen ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCopyMenuOpen((value) => !value)}
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
                        <button
                          type="button"
                          aria-label="Close copy menu"
                          className="fixed inset-0 z-10 cursor-default"
                          onClick={() => setCopyMenuOpen(false)}
                        />
                        <div
                          role="menu"
                          className="absolute right-0 top-8 z-20 min-w-[168px] overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-lg"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              void onCopyBody();
                              setCopyMenuOpen(false);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                          >
                            Copy Markdown
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              void onCopyFormatted();
                              setCopyMenuOpen(false);
                            }}
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
                    onClick={() => void onCopyBody()}
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
                ))}
              {body.trim() && (
                <button
                  type="button"
                  onClick={onDownload}
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
                    onClick={onToggleArchived}
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
                      onFlush();
                      onTrash(target.note.id);
                      if (!isPanel) onDismiss();
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
              setActionsOpen((value) => {
                if (value) {
                  setColorMenuOpen(false);
                  setCopyMenuOpen(false);
                }
                return !value;
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
              onClick={() => void onCopyBody()}
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
              onFlush();
              onRestore(target.note.id);
              if (!isPanel) onDismiss();
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
                onDismiss();
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
        onClick={onRequestClose}
        aria-label="Close editor"
        className={ICON_BUTTON}
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
