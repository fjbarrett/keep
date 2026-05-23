"use client";

import { useEffect, useState } from "react";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

type Passkey = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};

export function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported =
    typeof window !== "undefined" && browserSupportsWebAuthn();

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/passkeys");
      if (!res.ok) {
        setPasskeys([]);
        return;
      }
      const data = (await res.json()) as { passkeys: Passkey[] };
      setPasskeys(data.passkeys);
    } catch {
      setPasskeys([]);
    }
  }

  async function addPasskey() {
    setError(null);
    setBusy(true);
    try {
      const optionsRes = await fetch("/api/passkeys/register/options", {
        method: "POST",
      });
      if (!optionsRes.ok) throw new Error("could not start registration");
      const options = await optionsRes.json();
      const response = await startRegistration(options);
      const verifyRes = await fetch("/api/passkeys/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (!verifyRes.ok) throw new Error("verification failed");
      await refresh();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to add passkey";
      // The browser cancels with NotAllowedError when the user dismisses the
      // prompt — quiet that one specifically; surface everything else.
      if (!/NotAllowed/i.test(message)) setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
    if (!confirm("Remove this passkey? You won't be able to sign in with it.")) {
      return;
    }
    await fetch(`/api/passkeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  if (!supported) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs text-[var(--color-muted)]">
        Passkeys aren&apos;t supported in this browser.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Passkeys
        </span>
        <button
          type="button"
          onClick={addPasskey}
          disabled={busy}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Adding..." : "Add passkey"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-[var(--color-danger)]">{error}</p>
      )}

      {passkeys === null ? (
        <p className="text-xs text-[var(--color-muted)]">Loading…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">
          No passkeys yet. Add one to skip Google next time.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {passkeys.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-[var(--color-text)]">
                  {p.name || "Passkey"}
                </p>
                <p className="text-[10px] text-[var(--color-muted)]">
                  {p.lastUsedAt
                    ? `Last used ${formatDate(p.lastUsedAt)}`
                    : `Added ${formatDate(p.createdAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removePasskey(p.id)}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
