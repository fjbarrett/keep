import { NextResponse } from "next/server";
import { pool, ready, newId } from "@/lib/db";
import { hashPassword, passwordIssue } from "@/lib/password";
import { normalizeUsername, usernameIssue } from "@/lib/username";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { recordSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";

// Each call writes a user row — cap per-IP so the endpoint can't be used for
// signup spam. (On an onion service every client looks like the same "unknown"
// IP, so this budget is shared there; per-account abuse is bounded by the
// uniqueness of usernames and the login throttle, not by this limiter.)
const registerRateLimit = createTokenBucketRateLimiter({
  limit: 6,
  windowMs: 60_000,
});

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(
    registerRateLimit,
    req.headers,
    "auth-register-username",
    "Too many attempts. Try again shortly.",
  );
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const rawUsername = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const nameIssue = usernameIssue(rawUsername);
  if (nameIssue) return NextResponse.json({ error: nameIssue }, { status: 400 });
  const passIssue = passwordIssue(password);
  if (passIssue) return NextResponse.json({ error: passIssue }, { status: 400 });

  // Store the user's chosen capitalization; compare on the lowercased form.
  const display = rawUsername.trim();
  const username = normalizeUsername(rawUsername);

  await ready();
  const existing = await pool().query("SELECT id FROM users WHERE lower(username) = $1", [username]);
  if (existing.rows[0]) {
    // Unlike email, a username is not sensitive and the user must be told to
    // pick another — so this is a specific message, not an anti-enumeration one.
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }

  const id = newId();
  const hash = await hashPassword(password);
  try {
    await pool().query(
      `INSERT INTO users (id, username, name, password_hash, updated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, display, display, hash, Date.now()],
    );
  } catch {
    // A concurrent signup can win the race between the check above and this
    // insert; the unique index turns that into a clean "taken" rather than a 500.
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }

  void recordSecurityEvent("register", {
    userId: id,
    headers: req.headers,
    meta: { method: "username", username },
  });

  // No verification email — the client signs in immediately with the same creds.
  return NextResponse.json({ ok: true });
}
