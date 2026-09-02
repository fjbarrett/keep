"use client";

import { useState } from "react";
import { XIcon } from "@/components/Icons";
import { detectCodeLanguage, languageLabel } from "@/lib/detectLanguage";
import { previewText } from "@/lib/inferTitle";
import { Note } from "@/lib/types";
import { useModalDialog } from "@/lib/useModalDialog";

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
  const dialogRef = useModalDialog(onClose);
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
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Couldn't set that link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be unavailable outside a secure context.
    }
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

  function formatTimestamp(timestamp: number) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }

  function formatBytes(value: number) {
    if (value < 1024) return `${value} bytes`;
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close text info"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-info-title"
        tabIndex={-1}
        className="relative z-10 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 id="text-info-title" className="text-sm font-semibold text-[var(--color-text)]">
            Text Info
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close text info"
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
            <dd className="text-right text-[var(--color-text)]">
              {formatTimestamp(note.createdAt)}
            </dd>
            <dt className="text-[var(--color-muted)]">Modified</dt>
            <dd className="text-right text-[var(--color-text)]">
              {formatTimestamp(note.updatedAt)}
            </dd>
            <dt className="text-[var(--color-muted)]">Words</dt>
            <dd className="text-right text-[var(--color-text)]">{words.toLocaleString()}</dd>
            <dt className="text-[var(--color-muted)]">Characters</dt>
            <dd className="text-right text-[var(--color-text)]">{chars.toLocaleString()}</dd>
            <dt className="text-[var(--color-muted)]">Size</dt>
            <dd className="text-right text-[var(--color-text)]">{formatBytes(bytes)}</dd>
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
                      aria-label="Public link"
                      onFocus={(event) => event.currentTarget.select()}
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
                      onChange={(event) => setVanity(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && saveVanity()}
                      placeholder="custom-link"
                      aria-label="Custom public link"
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
                    <p className="mt-1.5 text-xs text-[var(--color-danger)]" role="alert">
                      {shareError}
                    </p>
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
