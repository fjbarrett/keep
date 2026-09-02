"use client";

import { Note } from "@/lib/types";
import {
  ArchiveIcon,
  DownloadIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/Icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccentPicker } from "@/components/AccentPicker";
import { useModalDialog } from "@/lib/useModalDialog";

export function SettingsPane({
  importing,
  importRef,
  notes,
  isGuest,
  counts,
  onOpenArchive,
  onOpenTrash,
  onImportClick,
  onImport,
  importTextsRef,
  onImportTextsClick,
  onImportTexts,
  onGuestExport,
  onClose,
}: {
  importing: boolean;
  importRef: React.RefObject<HTMLInputElement | null>;
  notes: Note[];
  isGuest: boolean;
  counts: { archive: number; trash: number };
  onOpenArchive: () => void;
  onOpenTrash: () => void;
  onImportClick: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importTextsRef: React.RefObject<HTMLInputElement | null>;
  onImportTextsClick: () => void;
  onImportTexts: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGuestExport: () => void;
  onClose: () => void;
}) {
  const exportableCount = notes.filter((note) => !note.trashed).length;
  const dialogRef = useModalDialog<HTMLElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 id="settings-title" className="text-sm font-semibold text-[var(--color-text)]">
            Settings
          </h2>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Accent
          </h3>
          <AccentPicker />

          <h3 className="pt-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
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
            <span>{importing ? "Importing..." : "Import from Google Keep"}</span>
            <UploadIcon className="h-4 w-4" />
          </button>

          <input
            ref={importTextsRef}
            type="file"
            accept=".txt,.md,.markdown,.pdf,.zip,text/plain,application/pdf,application/zip"
            onChange={onImportTexts}
            className="hidden"
          />
          <button
            type="button"
            onClick={onImportTextsClick}
            disabled={importing}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)] disabled:opacity-60"
          >
            <span>{importing ? "Importing..." : "Import texts (.txt / .pdf / .zip)"}</span>
            <UploadIcon className="h-4 w-4" />
          </button>

          {exportableCount > 0 && isGuest ? (
            <button
              type="button"
              onClick={onGuestExport}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              <span>Export texts</span>
              <DownloadIcon className="h-4 w-4" />
            </button>
          ) : exportableCount > 0 ? (
            <a
              href="/api/notes/export"
              className="flex w-full items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              onClick={onClose}
            >
              <span>Export texts</span>
              <DownloadIcon className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] opacity-60"
            >
              <span>Export texts</span>
              <DownloadIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
