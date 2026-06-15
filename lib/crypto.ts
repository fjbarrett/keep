// lib/crypto.ts — Client-side end-to-end encryption for note bodies
//
// Security model
// ──────────────
//  1. The user sets a passphrase that never leaves the browser.
//  2. PBKDF2 (600 000 iterations, SHA-256) derives a 256-bit AES-GCM key
//     from that passphrase + a random per-user salt stored on the server.
//     The salt isn't secret — it just ensures two users with the same
//     passphrase get different keys.
//  3. Each note body is encrypted with a fresh 12-byte IV per save.
//     The IV is prepended to the ciphertext so no side-channel is needed.
//  4. The server stores only ciphertext prefixed with "enc:".
//     It never sees plaintext and cannot decrypt without the passphrase.
//  5. Legacy (pre-encryption) notes remain readable — decryptBody returns
//     them unchanged if they don't start with "enc:".

/**
 * Derives a 256-bit AES-GCM key from a user passphrase and a server-stored salt.
 *
 * 600 000 PBKDF2 iterations matches the OWASP 2023 recommendation for SHA-256.
 * The derived CryptoKey is marked non-extractable — the raw key bytes never
 * leave the WebCrypto sandbox.
 */
export async function deriveKey(
  passphrase: string,
  saltHex: string,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: 600_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,        // non-extractable: the key bytes stay inside WebCrypto
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a note body with AES-GCM.
 *
 * A random 12-byte IV is generated per call and prepended to the ciphertext
 * so the same plaintext never produces the same output. Returns a string of
 * the form "enc:<base64(iv || ciphertext)>" — safe to store as TEXT in Postgres.
 */
export async function encryptBody(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  // Pack iv + ciphertext so the decrypt side needs one base64 decode.
  const packed = new Uint8Array(12 + ciphertext.byteLength) as Uint8Array<ArrayBuffer>;
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext) as Uint8Array<ArrayBuffer>, 12);
  return "enc:" + bytesToBase64(packed);
}

/**
 * Decrypts a body produced by encryptBody.
 *
 * Returns the original plaintext, or the input unchanged if it is not
 * an encrypted body (no "enc:" prefix). Throws on authentication failure,
 * which means either the key is wrong or the ciphertext was tampered with.
 */
export async function decryptBody(
  key: CryptoKey,
  body: string,
): Promise<string> {
  if (!body.startsWith("enc:")) return body;   // plaintext passthrough
  const packed = base64ToBytes(body.slice(4));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    key,
    packed.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}

/** Generates a random 32-byte hex salt for a new user. Call once; persist server-side. */
export function generateSalt(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)) as Uint8Array<ArrayBuffer>);
}

/** Returns true when a body was encrypted by encryptBody. */
export function isEncrypted(body: string): boolean {
  return body.startsWith("enc:");
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(hex.length / 2) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}
