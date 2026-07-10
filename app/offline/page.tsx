import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Offline · Keep",
};

// Neutral, personalization-free fallback the service worker serves when a
// navigation happens with no network. It renders no account data, so it's safe
// to precache and show to anyone on the device — the signed-in app shell
// deliberately isn't cached, which is why offline navigations land here.
export default function OfflinePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <Logo size={44} />
        </div>
        <h1 className="text-base font-medium text-[var(--color-text)]">
          You're offline
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          No connection right now. Your notes are safe and load again the moment
          you're back online.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-sm hover:bg-[var(--color-surface-hover)]"
        >
          Try again
        </a>
      </div>
    </main>
  );
}
