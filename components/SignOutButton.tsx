"use client";

import { readNoteDrafts } from "@/lib/noteDrafts";
import { signOut } from "next-auth/react";
import { clearOwnerData, getPendingOps } from "@/lib/offlineDb";

export function SignOutButton({ ownerId }: { ownerId: string }) {
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
    await clearOwnerData(ownerId).catch(() => {});
    try {
      localStorage.setItem("keep.signout", JSON.stringify({ ownerId, at: Date.now() }));
      localStorage.removeItem("keep.signout");
    } catch {
      // Storage may be disabled; this browser's session still ends below.
    }
    // Ends only this browser's session. Revoking every device (POST
    // /api/auth/revoke) is a distinct, explicit action — a plain "Sign out"
    // must not silently log out the user's phone and other browsers.
    await signOut({ callbackUrl: "/signin" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
    >
      Sign out
    </button>
  );
}
