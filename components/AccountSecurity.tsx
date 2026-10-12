"use client";
import { useState } from "react";
import { getPendingOps } from "@/lib/offlineDb";
import { readNoteDrafts } from "@/lib/noteDrafts";
import { signOutAccount } from "@/lib/signOutAccount";
import { SignOutButton } from "./SignOutButton";

export function AccountSecurity({ ownerId }: { ownerId: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    setError(null);
    try {
      if (readNoteDrafts(ownerId).length || (await getPendingOps(ownerId)).length) {
        throw new Error("Sync or export your pending edits before changing your password.");
      }
      const response = await fetch("/api/auth/password", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, currentPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update your password.");
      setPassword(""); setCurrentPassword(""); setConfirm("");
      await signOutAccount(ownerId);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update your password."); }
    finally { setBusy(false); }
  }
  const input = "w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm";
  return <section className="space-y-3 border-t border-[var(--color-border)] pt-3" aria-label="Account security">
    <h3 className="text-sm font-medium">Account security</h3>
    <form onSubmit={submit} className="space-y-2">
      <p className="text-xs text-[var(--color-muted)]">Set or change your password. This signs out every device. Google-only accounts can leave the current password blank after signing in again.</p>
      <input className={input} aria-label="Current password" placeholder="Current password (if set)" autoComplete="current-password" type="password" maxLength={1024} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} disabled={busy} />
      <input className={input} aria-label="New password" placeholder="New password (10+ characters)" autoComplete="new-password" type="password" minLength={10} maxLength={1024} required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
      <input className={input} aria-label="Confirm new password" placeholder="Confirm new password" autoComplete="new-password" type="password" maxLength={1024} required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} />
      <button disabled={busy} className="rounded bg-[var(--color-accent)] px-3 py-2 text-sm text-[var(--color-accent-fg)]">{busy ? "Saving…" : "Save password and sign out"}</button>
      {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
    </form>
    <SignOutButton ownerId={ownerId} everywhere />
  </section>;
}
