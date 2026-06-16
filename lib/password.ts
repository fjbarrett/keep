import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from "crypto";

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) =>
      err ? reject(err) : resolve(derivedKey),
    );
  });
}

// scrypt parameters. N is the CPU/memory cost (2^14); encode them in the stored
// string so they can be tuned later without breaking existing hashes.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Returns `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  try {
    const derived = (await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })) as Buffer;
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

/** Minimal strength check; keep it permissive enough for passphrases. */
export function passwordIssue(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (/^\d+$/.test(password)) return "Use more than just digits.";
  return null;
}
