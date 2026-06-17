import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { pool, ready, newId } from "@/lib/db";
import { hashPassword, passwordIssue } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";

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
  const existing = await pool().query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  if (existing.rows[0]) {
    // Generic message — don't reveal whether the email exists.
    return NextResponse.json({ error: "Could not create the account." }, { status: 409 });
  }

  const id = newId();
  const hash = await hashPassword(password);
  const token = randomBytes(32).toString("hex");
  await pool().query(
    `INSERT INTO users (id, email, name, password_hash, verify_token, verify_token_expires, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, email, null, hash, token, Date.now() + VERIFY_TOKEN_TTL_MS, Date.now()],
  );

  const origin = process.env.AUTH_URL ?? new URL(req.url).origin;
  const verifyUrl = `${origin.replace(/\/$/, "")}/api/auth/verify?token=${token}`;
  try {
    await sendVerificationEmail(email, verifyUrl);
  } catch (err) {
    // Don't fail sign-up if the email send fails — the user can re-request.
    console.error("verification email failed:", err);
  }

  return NextResponse.json({ ok: true });
}
