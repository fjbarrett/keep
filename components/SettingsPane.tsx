"use client";

import { Note } from "@/lib/types";
import {
  ArchiveIcon,
  DownloadIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/Icons";
import { PasskeysSection } from "@/components/PasskeysSection";

export function SettingsPane({
  importing,
  importRef,
  notes,
  isGuest,
  counts,
  encStatus,
  onOpenArchive,
  onOpenTrash,
  onImportClick,
  onImport,
  onGuestExport,
  onEnableEncryption,
  onDisableEncryption,
  onClose,
}: {
  importing: boolean;
  importRef: React.RefObject<HTMLInputElement>;
  notes: Note[];
  isGuest: boolean;
  counts: { archive: number; trash: number };
  encStatus: "loading" | "disabled" | "locked" | "unlocked";
  onOpenArchive: () => void;
  onOpenTrash: () => void;
  onImportClick: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGuestExport: () => void;
  onEnableEncryption: () => void;
  onDisableEncryption: () => void;
  onClose: () => void;
}) {
  const exportableCount = notes.filter((note) => !note.trashed).length;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="Settings">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default bg-black/35"
        onClick={onClose}
      />
      <section className="absolute right-4 top-20 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl sm:right-6">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Views
          </h3>
          <button
            type="button"
            onClick={onOpenArchive}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            <span className="flex items-center gap-2">
              <ArchiveIcon className="h-4 w-4 text-[var(--color-muted)]" />
              Archive
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {counts.archive}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenTrash}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            <span className="flex items-center gap-2">
              <TrashIcon className="h-4 w-4 text-[var(--color-muted)]" />
              Trash
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {counts.trash}
            </span>
          </button>

          <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Data
          </h3>

          <input
            ref={importRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={onImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={onImportClick}
            disabled={importing}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:opacity-60"
          >
            <span>{importing ? "Importing..." : "Import Google Keep"}</span>
            <UploadIcon className="h-4 w-4" />
          </button>

          {exportableCount > 0 && isGuest ? (
            <button
              type="button"
              onClick={onGuestExport}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              <span>Export notes</span>
              <DownloadIcon className="h-4 w-4" />
            </button>
          ) : exportableCount > 0 ? (
            <a
              href="/api/notes/export"
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              onClick={onClose}
            >
              <span>Export notes</span>
              <DownloadIcon className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] opacity-60"
            >
              <span>Export notes</span>
              <DownloadIcon className="h-4 w-4" />
            </button>
          )}

          {!isGuest && (
            <>
              <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Security
              </h3>
              <PasskeysSection />
              {encStatus !== "loading" && (
                <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      End-to-end encryption
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {encStatus === "disabled"
                        ? "Notes stored as plaintext"
                        : encStatus === "locked"
                        ? "Enabled · locked this session"
                        : "Enabled · unlocked"}
                    </p>
                  </div>
                  {encStatus === "disabled" ? (
                    <button
                      type="button"
                      onClick={() => { onEnableEncryption(); onClose(); }}
                      className="ml-3 shrink-0 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
                    >
                      Enable
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onDisableEncryption}
                      className="ml-3 shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                    >
                      Disable
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
