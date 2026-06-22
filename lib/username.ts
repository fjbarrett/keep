// Username rules for the username + passphrase sign-in path (Tor-friendly: no
// email required). The lowercased form is the identity — uniqueness and lookup
// both key on lower(username). Users pick their own capitalization for display,
// but it never distinguishes one account from another.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 10;

// Letters and numbers only — no punctuation, symbols, or whitespace. Tested
// against the lowercased form, so this also covers A–Z.
const USERNAME_RE = /^[a-z0-9]+$/;

/** The identity form: trimmed and lowercased. This is what we store-compare on. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns a human-readable problem with the username, or null if it's valid. */
export function usernameIssue(raw: string): string | null {
  const display = raw.trim();
  if (!display) return "Choose a username.";
  if (display.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (display.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(display.toLowerCase())) return "Use letters and numbers only.";
  return null;
}
