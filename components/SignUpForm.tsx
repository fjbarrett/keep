"use client";

import { useState } from "react";

const INPUT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setDone(true);
      } else {
        setError(data?.error ?? "Could not create the account.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-text)]">Check your email</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          We sent a verification link to <strong>{email}</strong>. After verifying, you can{" "}
          <a href="/signin" className="text-[var(--color-link)] hover:underline">
            sign in
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        className={INPUT}
      />
      <input
        type="password"
        placeholder="Password (10+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        className={INPUT}
      />
      <input
        type="password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        className={INPUT}
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email || !password || !confirm}
        className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="pt-1 text-center text-xs text-[var(--color-muted)]">
        Already have an account?{" "}
        <a href="/signin" className="text-[var(--color-link)] hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
