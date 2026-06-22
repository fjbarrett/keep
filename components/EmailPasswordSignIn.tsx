"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { USERNAME_MAX } from "@/lib/username";

const INPUT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none";

export function EmailPasswordSignIn({ redirectTo }: { redirectTo: string }) {
  const [mode, setMode] = useState<"email" | "username">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isUsername = mode === "username";

  function switchMode(next: "email" | "username") {
    setMode(next);
    setIdentifier("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = isUsername
      ? await signIn("username", { username: identifier, password, redirect: false })
      : await signIn("password", { email: identifier, password, redirect: false });
    setBusy(false);
    if (res?.ok) {
      window.location.href = res.url ?? redirectTo;
    } else {
      setError(isUsername ? "Username or passphrase is incorrect." : "Email or password is incorrect.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {isUsername ? (
        <input
          type="text"
          placeholder="Username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          className={INPUT}
        />
      ) : (
        <input
          type="email"
          placeholder="Email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="email"
          className={INPUT}
        />
      )}
      <input
        type="password"
        placeholder={isUsername ? "Passphrase" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        className={INPUT}
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !identifier || !password}
        className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => switchMode(isUsername ? "email" : "username")}
        className="block w-full pt-1 text-center text-xs text-[var(--color-link)] hover:underline"
      >
        {isUsername ? "Sign in with email instead" : "Sign in with a username instead"}
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
