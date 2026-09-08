"use client";

import { useState } from "react";

export function ResendVerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Could not request a new link. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not request a new link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="mb-4 text-xs text-[var(--color-muted)]">
        If that address has an unverified account, a new link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
      <input
        name="email"
        disabled={busy}
        autoComplete="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email address"
        aria-label="Email address for a new verification link"
        className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text)] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send new link"}
      </button>
      {error && <p className="w-full text-xs text-[var(--color-danger)]" role="alert">{error}</p>}
    </form>
  );
}
