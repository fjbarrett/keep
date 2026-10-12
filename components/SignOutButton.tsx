"use client";

import { readNoteDrafts } from "@/lib/noteDrafts";
import { useState } from "react";
import { signOutAccount } from "@/lib/signOutAccount";
import { getPendingOps } from "@/lib/offlineDb";

export function SignOutButton({ ownerId, everywhere = false }: { ownerId: string; everywhere?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function handleSignOut() {
    // Queued offline edits die with clearOwnerData; make that an informed
    // choice instead of silent loss.
    const pending = await getPendingOps(ownerId).catch(() => []);
    if (
      (pending.length > 0 || readNoteDrafts(ownerId).length > 0) &&
      !window.confirm(
        "Some note changes haven't synced yet and will be lost if you sign out now. Sign out anyway?",
      )
    ) {
      return;
    }
    if (everywhere && !window.confirm("Sign out on all your devices?")) return;
    setBusy(true);
    setError(null);
    try {
      if (everywhere) {
        const response = await fetch("/api/auth/revoke", { method: "POST" });
        if (!response.ok) throw new Error("Could not sign out other devices. Try again.");
      }
      await signOutAccount(ownerId);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not sign out."); }
    finally { setBusy(false); }
  }

  return (
    <span><button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
    >
      {everywhere ? "Sign out everywhere" : "Sign out"}
    </button>{error && <span role="alert" className="block text-sm text-[var(--color-danger)]">{error}</span>}</span>
  );
}
