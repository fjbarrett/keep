import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="grid min-h-0 flex-1 place-items-center bg-[var(--color-canvas)] px-6">
        <div className="max-w-sm text-center">
          <p className="text-base font-medium text-[var(--color-text)]">
            That page isn&apos;t here
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            The text may have been deleted, moved, or shared with a different link.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Back to texts
          </a>
        </div>
      </main>
    </>
  );
}
