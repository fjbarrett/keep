"use client";

import { useState } from "react";
import { ResendVerificationForm } from "@/components/ResendVerificationForm";

const INPUT =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none";

export function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRecoveryEmail(null);
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
        setPassword("");
        setConfirm("");
        setDone(true);
      } else {
        setError(data?.error ?? "Could not create the account.");
        if (res.status === 409 || res.status === 503) setRecoveryEmail(email.trim());
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
        <p role="status" className="text-sm font-medium text-[var(--color-text)]">Check your email</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          We sent a verification link to <strong>{email}</strong>. After verifying, you can{" "}
          <a href="/signin" className="text-[var(--color-link)] hover:underline">
            sign in
          </a>
          .
        </p>
        <div className="mt-4 text-left">
          <p className="mb-2 text-xs text-[var(--color-muted)]">Didn't get the email? Check spam or request a new link.</p>
          <ResendVerificationForm initialEmail={email.trim()} />
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          aria-label="Email"
          name="email"
          disabled={busy}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={INPUT}
        />
        <input
          aria-label="Password"
          name="password"
          disabled={busy}
          type="password"
          placeholder="Password (10+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className={INPUT}
        />
        <input
          aria-label="Confirm password"
          name="confirm-password"
          disabled={busy}
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={INPUT}
        />
        {error && <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
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
      {recoveryEmail !== null && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <p className="mb-2 text-xs text-[var(--color-muted)]">
            Waiting to verify your email? Request a new link, then sign in with your original password.
            If you used Google, choose Continue with Google on the sign-in page.
          </p>
          <ResendVerificationForm key={recoveryEmail} initialEmail={recoveryEmail} />
        </div>
      )}
    </>
  );
}
