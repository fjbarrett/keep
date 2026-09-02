"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-0 flex-1 place-items-center bg-[var(--color-canvas)] px-6">
      <div className="max-w-sm text-center">
        <p className="text-base font-medium text-[var(--color-text)]">
          Keep hit an unexpected error
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Your local edits are still in this browser. Try loading the view again.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            Back to texts
          </a>
        </div>
      </div>
    </main>
  );
}
