import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { pool, ready, newId } from "@/lib/db";
import { hashPassword, passwordIssue } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { logger, maskEmail } from "@/lib/logger";
import { recordSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";

// Verification links expire after a day so a leaked link can't be redeemed
// indefinitely; users can re-register or re-request to get a fresh one.
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Each call writes a user row and sends an email — cap per-IP so the endpoint
// can't be used for signup spam or email-enumeration sweeps.
const registerRateLimit = createTokenBucketRateLimiter({
  limit: 6,
  windowMs: 60_000,
});

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(
    registerRateLimit,
    req.headers,
    "auth-register",
    "Too many attempts. Try again shortly.",
  );
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const issue = passwordIssue(password);
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });

  await ready();
  const existing = await pool().query<{ id: string }>(
    "SELECT id FROM users WHERE lower(email) = $1",
    [email],
  );
  if (existing.rows[0]) {
    // Generic message — don't reveal whether the email exists. Crucially, never
    // rewrite an existing (even unverified) account here: an UPDATE would let an
    // attacker who knows a victim's email overwrite its password_hash before the
    // victim verifies, then have the victim activate an attacker-set password.
    // A legit unverified user re-requests their link via /api/auth/resend, which
    // refreshes only the token and leaves the password untouched.
    return NextResponse.json({ error: "Could not create the account." }, { status: 409 });
  }

  const id = newId();
  const hash = await hashPassword(password);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await pool().query(
    `INSERT INTO users (id, email, name, password_hash, verify_token, verify_token_expires, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, email, null, hash, token, now + VERIFY_TOKEN_TTL_MS, now],
  );

  void recordSecurityEvent("register", {
    userId: id,
    headers: req.headers,
    meta: { email: maskEmail(email) },
  });

  const origin = process.env.AUTH_URL ?? new URL(req.url).origin;
  const verifyUrl = `${origin.replace(/\/$/, "")}/api/auth/verify?token=${token}`;
  try {
    await sendVerificationEmail(email, verifyUrl);
  } catch (err) {
    logger.error("verification email failed", { route: "auth:register", err, to: maskEmail(email) });
    return NextResponse.json(
      { error: "Your account was saved, but the verification email could not be sent. Try again." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
