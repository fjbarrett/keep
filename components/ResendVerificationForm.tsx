"use client";

import { useState } from "react";

export function ResendVerificationForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("request failed");
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="mb-4 text-xs text-[var(--color-muted)]">
        If that address has an unverified account, a new link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mb-4 flex gap-2">
      <input
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
      {error && <span className="sr-only" role="alert">Could not send a new link.</span>}
    </form>
  );
}
