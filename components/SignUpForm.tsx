"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { USERNAME_MAX } from "@/lib/username";

const INPUT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none";

export function SignUpForm() {
  const [mode, setMode] = useState<"email" | "username">("email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const isUsername = mode === "username";

  function switchMode(next: "email" | "username") {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(isUsername ? "Passphrases don't match." : "Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      if (isUsername) {
        const res = await fetch("/api/auth/register/username", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Could not create the account.");
          return;
        }
        // No email to verify — sign in with the same credentials right away.
        const signed = await signIn("username", { username, password, redirect: false });
        window.location.href = signed?.ok ? (signed.url ?? "/") : "/signin";
        return;
      }
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

  const canSubmit = isUsername
    ? username && password && confirm
    : email && password && confirm;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {isUsername ? (
        <input
          type="text"
          placeholder={`Username (letters and numbers, max ${USERNAME_MAX})`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={INPUT}
        />
      )}
      <input
        type="password"
        placeholder={isUsername ? "Passphrase (10+ characters)" : "Password (10+ characters)"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        className={INPUT}
      />
      <input
        type="password"
        placeholder={isUsername ? "Confirm passphrase" : "Confirm password"}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        className={INPUT}
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <button
        type="submit"
        disabled={busy || !canSubmit}
        className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => switchMode(isUsername ? "email" : "username")}
        className="block w-full pt-1 text-center text-xs text-[var(--color-link)] hover:underline"
      >
        {isUsername ? "Sign up with email instead" : "Sign up with a username instead"}
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
