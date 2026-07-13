import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { logger, maskEmail } from "@/lib/logger";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";
import { appOrigin, isSameOriginMutation } from "@/lib/appUrl";

export const runtime = "nodejs";

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const resendRateLimit = createTokenBucketRateLimiter({ limit: 6, windowMs: 60_000 });
const response = () => NextResponse.json({ ok: true });
const MAX_RESEND_BODY = 2 * 1024;

export async function POST(req: Request) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const limited = enforceIpRateLimit(
    resendRateLimit,
    req.headers,
    "auth-resend",
    "Too many attempts. Try again shortly.",
  );
  if (limited) return limited;
  const origin = appOrigin(req);

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_RESEND_BODY);
  } catch (err) {
    const tooLarge = requestBodyError(err);
    if (tooLarge) return tooLarge;
    body = null;
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return response();

  await ready();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const { rows } = await pool().query<{ id: string }>(
    `UPDATE users
        SET verify_token = $1, verify_token_expires = $2, updated_at = $3
      WHERE lower(email) = $4 AND email_verified IS NULL
      RETURNING id`,
    [token, now + VERIFY_TOKEN_TTL_MS, now, email],
  );
  if (!rows[0]) return response();

  const verifyUrl = `${origin.replace(/\/$/, "")}/api/auth/verify?token=${token}`;
  try {
    await sendVerificationEmail(email, verifyUrl);
  } catch (error) {
    logger.error("verification resend failed", {
      route: "auth:resend",
      error,
      to: maskEmail(email),
    });
  }
  return response();
}
