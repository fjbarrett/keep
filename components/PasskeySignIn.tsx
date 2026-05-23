"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import {
  startAuthentication,
  browserSupportsWebAuthnAutofill,
} from "@simplewebauthn/browser";

export function PasskeySignIn({ redirectTo }: { redirectTo: string }) {
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      setSupported(true);
      try {
        const options = await fetch("/api/passkeys/auth/options", {
          method: "POST",
        }).then((r) => r.json());
        // useBrowserAutofill=true: this resolves only when the user picks a
        // passkey from the browser's autofill suggestion on the focused input.
        const assertion = await startAuthentication(options, true);
        if (cancelled) return;
        const result = await signIn("passkey", {
          assertion: JSON.stringify(assertion),
          redirect: false,
          redirectTo,
        });
        if (result?.ok) {
          window.location.href = result.url ?? redirectTo;
        } else {
          setError("Sign-in failed. Try Google instead.");
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (!/AbortError|NotAllowed/i.test(msg)) {
          setError("Couldn't sign in with passkey.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [redirectTo]);

  if (!supported) return null;

  return (
    <div className="mt-4 space-y-2">
      <label className="block text-xs text-[var(--color-muted)]">
        Or sign in with a passkey
        <input
          type="text"
          autoComplete="username webauthn"
          placeholder="Tap to use a passkey"
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </label>
      {error && (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  );
}
