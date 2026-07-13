"use client";

import { signOut } from "next-auth/react";
import { clearOwnerData } from "@/lib/offlineDb";

export function SignOutButton({ ownerId }: { ownerId: string }) {
  async function handleSignOut() {
    await clearOwnerData(ownerId).catch(() => {});
    try {
      localStorage.setItem("keep.signout", JSON.stringify({ ownerId, at: Date.now() }));
      localStorage.removeItem("keep.signout");
    } catch {
      // Storage may be disabled; server-side session revocation still proceeds.
    }
    await fetch("/api/auth/revoke", { method: "POST" }).catch(() => null);
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
