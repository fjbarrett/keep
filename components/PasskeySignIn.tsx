"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { startAuthentication } from "@simplewebauthn/browser";

export function PasskeySignIn({ redirectTo }: { redirectTo: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePasskeySignIn() {
    setError(null);
    setBusy(true);
    try {
      const optionsRes = await fetch("/api/passkeys/auth/options", {
        method: "POST",
      });
      if (!optionsRes.ok) {
        setError("Couldn't start passkey authentication.");
        setBusy(false);
        return;
      }
      const options = await optionsRes.json();
      const assertion = await startAuthentication(options);
      const result = await signIn("passkey", {
        assertion: JSON.stringify(assertion),
        redirect: false,
      });
      if (result?.ok) {
        window.location.href = result.url ?? redirectTo;
      } else {
        setError(result?.error === "CredentialsSignin"
          ? "Passkey not recognized. Try signing in with Google first, then add a passkey."
          : "Sign-in failed. Try Google instead.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/AbortError|NotAllowed/i.test(msg)) {
        setBusy(false);
        return;
      }
      setError("Couldn't sign in with passkey.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handlePasskeySignIn}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-sm hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
      >
        <PasskeyMark />
        {busy ? "Waiting for passkey..." : "Sign in with a passkey"}
      </button>
      {error && (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}

function PasskeyMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="7" r="4" />
      <path d="M10 13c-4 0-7 2-7 4v1h10" />
      <path d="M17 14l2 2 3-3" />
    </svg>
  );
}
