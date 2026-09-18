import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { pool, ready, newId } from "@/lib/db";
import { hashPassword, passwordIssue } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { logger, maskEmail } from "@/lib/logger";
import { recordSecurityEvent } from "@/lib/audit";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";
import { appOrigin, isSameOriginMutation } from "@/lib/appUrl";

export const runtime = "nodejs";

// Verification links expire after a day so a leaked link can't be redeemed
// indefinitely; users can request a fresh one via /api/auth/resend.
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Each call writes a user row and sends an email — cap per-IP so the endpoint
// can't be used for signup spam or email-enumeration sweeps.
const registerRateLimit = createTokenBucketRateLimiter({
  limit: 6,
  windowMs: 60_000,
});
const MAX_REGISTER_BODY = 4 * 1024;

export async function POST(req: Request) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const limited = enforceIpRateLimit(
    registerRateLimit,
    req.headers,
    "auth-register",
    "Too many attempts. Try again shortly.",
  );
  if (limited) return limited;
  const origin = appOrigin(req);

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_REGISTER_BODY);
  } catch (err) {
    const tooLarge = requestBodyError(err);
    if (tooLarge) return tooLarge;
    body = null;
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input?.password === "string" ? input.password : "";

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
    // Identical success response as a fresh registration, so the status code
    // can't probe which addresses hold accounts. Crucially, never rewrite an
    // existing (even unverified) account here: an UPDATE would let an attacker
    // who knows a victim's email overwrite its password_hash before the victim
    // verifies, then have the victim activate an attacker-set password. Only
    // the verification token is refreshed, and only on still-unverified rows —
    // the same predicate /api/auth/resend uses — so the password is untouched
    // and re-registering an unverified address still delivers a live link.
    // (#384's recoverability message is subsumed: the fresh link is delivered
    // inline instead of asking the user to request one.)
    const retryToken = randomBytes(32).toString("hex");
    const retryNow = Date.now();
    const { rows } = await pool().query<{ id: string }>(
      `UPDATE users
          SET verify_token = $1, verify_token_expires = $2, updated_at = $3
        WHERE lower(email) = $4 AND email_verified IS NULL
        RETURNING id`,
      [retryToken, retryNow + VERIFY_TOKEN_TTL_MS, retryNow, email],
    );
    if (rows[0]) {
      const verifyUrl = `${origin.replace(/\/$/, "")}/api/auth/verify?token=${retryToken}`;
      try {
        await sendVerificationEmail(email, verifyUrl);
      } catch (err) {
        logger.error("verification email failed", { route: "auth:register", err, to: maskEmail(email) });
      }
    }
    return NextResponse.json({ ok: true });
  }

  const id = newId();
  const hash = await hashPassword(password);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const inserted = await pool().query<{ id: string }>(
    `INSERT INTO users (id, email, name, password_hash, verify_token, verify_token_expires, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO NOTHING RETURNING id`,
    [id, email, null, hash, token, now + VERIFY_TOKEN_TTL_MS, now],
  );
  // A concurrent signup may have claimed this email after the lookup.
  if (!inserted.rows[0]) return accountConflict();

  void recordSecurityEvent("register", {
    userId: id,
    headers: req.headers,
    meta: { email: maskEmail(email) },
  });

  const verifyUrl = `${origin.replace(/\/$/, "")}/api/auth/verify?token=${token}`;
  try {
    await sendVerificationEmail(email, verifyUrl);
  } catch (err) {
    logger.error("verification email failed", { route: "auth:register", err, to: maskEmail(email) });
    return NextResponse.json(
      { error: "Your account was saved, but the verification email could not be sent. Request a new verification email below." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
