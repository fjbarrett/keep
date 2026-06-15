"use client";

// Manages the in-memory AES-GCM key for E2E note encryption.
//
// The key lives only in the module-level variable below — it is never
// written to localStorage, sessionStorage, or any other persistent store.
// A page refresh clears it, which is intentional: the user must re-enter
// their passphrase each session to unlock their notes.
import { useCallback, useEffect, useState } from "react";
import {
  deriveKey,
  encryptBody,
  decryptBody,
  generateSalt,
  isEncrypted,
} from "./crypto";

// Module-level so the key survives React re-renders but not page reloads.
let _key: CryptoKey | null = null;

export type EncStatus =
  | "loading"    // fetching salt from server
  | "disabled"   // no salt → encryption not configured
  | "locked"     // salt exists but passphrase not entered this session
  | "unlocked";  // key is in memory, notes can be decrypted

export function useEncryption() {
  const [status, setStatus] = useState<EncStatus>("loading");
  const [salt, setSalt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/enc/salt")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { salt: string | null } | null) => {
        const s = data?.salt ?? null;
        setSalt(s);
        if (!s) {
          setStatus("disabled");
        } else if (_key) {
          setStatus("unlocked");
        } else {
          setStatus("locked");
        }
      })
      .catch(() => setStatus("disabled"));
  }, []);

  const unlock = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (!salt) return false;
      try {
        _key = await deriveKey(passphrase, salt);
        setStatus("unlocked");
        return true;
      } catch {
        return false;
      }
    },
    [salt],
  );

  const setupEncryption = useCallback(async (passphrase: string): Promise<void> => {
    const newSalt = generateSalt();
    const res = await fetch("/api/enc/salt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salt: newSalt }),
    });
    if (!res.ok) throw new Error("Failed to save salt");
    _key = await deriveKey(passphrase, newSalt);
    setSalt(newSalt);
    setStatus("unlocked");
  }, []);

  const disableEncryption = useCallback(async (): Promise<void> => {
    await fetch("/api/enc/salt", { method: "DELETE" });
    _key = null;
    setSalt(null);
    setStatus("disabled");
  }, []);

  const lock = useCallback(() => {
    _key = null;
    if (salt) setStatus("locked");
  }, [salt]);

  const encrypt = useCallback(
    async (plaintext: string): Promise<string> => {
      if (!_key) return plaintext;
      return encryptBody(_key, plaintext);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status],
  );

  const decrypt = useCallback(
    async (body: string): Promise<string> => {
      if (!_key || !isEncrypted(body)) return body;
      try {
        return await decryptBody(_key, body);
      } catch {
        return "[Decryption failed — wrong passphrase?]";
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status],
  );

  return { status, unlock, setupEncryption, disableEncryption, lock, encrypt, decrypt };
}
