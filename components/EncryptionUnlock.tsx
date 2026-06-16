"use client";

import { useState } from "react";

export function EncryptionUnlock({
  onUnlock,
  onReset,
}: {
  onUnlock: (passphrase: string) => Promise<boolean>;
  onReset: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const ok = await onUnlock(passphrase);
      if (!ok) setError("Wrong passphrase — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-text)]">
          Unlock your notes
        </h2>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Your notes are end-to-end encrypted. Enter your passphrase to decrypt
          them — it never leaves this device.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          {error && (
            <p className="text-xs text-[var(--color-danger)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || !passphrase}
            className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Decrypting…" : "Unlock"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                "Reset encryption? This turns it off so you can use the app again, but any text encrypted with the forgotten passphrase stay unreadable.",
              )
            ) {
              onReset();
            }
          }}
          className="mt-4 w-full text-center text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:underline"
        >
          Forgot your passphrase?
        </button>
      </div>
    </div>
  );
}
