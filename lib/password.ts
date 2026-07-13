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

// OWASP-equivalent scrypt profile: 32 MiB with three parallel rounds. Parameters
// stay encoded in the hash so older rows can be verified and upgraded on login.
const N = 32768;
const R = 8;
const P = 3;
const KEYLEN = 64;
const MAXMEM = 128 * 1024 * 1024;

/** Returns `scrypt$N$r$p$saltB64$hashB64`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  })) as Buffer;
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (
    !Number.isInteger(params.N) ||
    params.N < 16384 ||
    params.N > 65536 ||
    (params.N & (params.N - 1)) !== 0 ||
    params.r !== R ||
    !Number.isInteger(params.p) ||
    params.p < 1 ||
    params.p > 8 ||
    salt.length < 16 ||
    expected.length !== KEYLEN
  ) return false;
  try {
    const derived = (await scryptAsync(password, salt, expected.length, {
      ...params,
      maxmem: MAXMEM,
    })) as Buffer;
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) !== N || Number(parts[2]) !== R || Number(parts[3]) !== P;
}

/** Minimal strength check; keep it permissive enough for passphrases. */
export function passwordIssue(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  // scrypt cost is paid on every login attempt, so an unbounded password is a
  // cheap DoS — cap it well above any real passphrase.
  if (password.length > 1024) return "Password is too long.";
  if (/^\d+$/.test(password)) return "Use more than just digits.";
  return null;
}
