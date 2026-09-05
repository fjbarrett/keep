"use client";

import {
  KeyboardIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
  StackIcon,
  XIcon,
} from "@/components/Icons";

export function GuestSaveBanner({
  isGuest,
  hasLocalNotes,
  onSave,
  onDismiss,
}: {
  isGuest: boolean;
  hasLocalNotes: boolean;
  onSave: () => Promise<{ saved: number }>;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
      <p className="text-sm text-[var(--color-muted)]">
        {hasLocalNotes
          ? "Some of your text is saved only in this browser."
          : "Your text is saved only in this browser."}
      </p>
      <div className="flex items-center gap-1.5">
        {isGuest ? (
          <a
            href="/signin?from=/"
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Sign in to save
          </a>
        ) : (
          <button
            type="button"
            onClick={() => {
              onSave().catch((error) => {
                alert(error instanceof Error ? error.message : "Failed to save");
              });
            }}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Save to account
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function DatabaseError({
  error,
  onRetry,
  onCopy,
}: {
  error: string;
  onRetry: () => void;
  onCopy?: () => void;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
      role="alert"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-text)]">
          Changes need attention
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {error}
        </p>
      </div>
      {onCopy && <button type="button" onClick={onCopy} className="shrink-0 text-xs underline">Save a copy</button>}
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

export function MiniRail({
  onNewNote,
  onOpenSettings,
  onOpenShortcuts,
  onExpand,
}: {
  onNewNote: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onExpand: () => void;
}) {
  const iconButton =
    "grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]";
  return (
    <aside
      aria-label="Collapsed sidebar"
      className="flex w-12 shrink-0 flex-col items-center justify-between bg-[var(--color-canvas)] py-2"
    >
      <button
        type="button"
        onClick={onNewNote}
        title="New"
        aria-label="New"
        className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className={iconButton}
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[rgba(255,179,19,0.14)] hover:text-[var(--color-orange)]"
        >
          <KeyboardIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onExpand}
          title="Show sidebar"
          aria-label="Show sidebar"
          className={iconButton}
        >
          <PanelLeftIcon className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

export function MainPlaceholder({
  hasNotes,
  onNewNote,
}: {
  hasNotes: boolean;
  onNewNote: () => void;
}) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="px-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <StackIcon className="h-5 w-5 text-[var(--color-muted)]" />
        </div>
        <p className="text-base font-medium text-[var(--color-text)]">
          {hasNotes ? "Select a text" : "No texts yet"}
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {hasNotes
            ? "Open a text from the sidebar, or create a new one."
            : "Start by creating your first text."}
        </p>
        <button
          type="button"
          onClick={onNewNote}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent-border)] bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New
        </button>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          or press{" "}
          <kbd className="inline-block min-w-[20px] rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-center font-mono text-[11px]">
            n
          </kbd>
        </p>
      </div>
    </div>
  );
}
