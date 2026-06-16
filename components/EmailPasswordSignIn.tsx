"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const INPUT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none";

export function EmailPasswordSignIn({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn("password", { email, password, redirect: false });
    setBusy(false);
    if (res?.ok) {
      window.location.href = res.url ?? redirectTo;
    } else {
      setError("Email or password is incorrect.");
    }
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
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        className={INPUT}
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="pt-1 text-center text-xs text-[var(--color-muted)]">
        No account?{" "}
        <a href="/signup" className="text-[var(--color-link)] hover:underline">
          Create one
        </a>
      </p>
    </form>
  );
}
