import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { appOrigin } from "@/lib/appUrl";

export const runtime = "nodejs";

// Tokens are 256-bit and unguessable, but still cap per-IP so the endpoint
// can't be hammered as a redemption oracle or to load the DB.
const verifyRateLimit = createTokenBucketRateLimiter({
  limit: 20,
  windowMs: 60_000,
});

export async function GET(req: Request) {
  const limited = enforceIpRateLimit(
    verifyRateLimit,
    req.headers,
    "auth-verify",
    "Too many attempts. Try again shortly.",
  );
  if (limited) return limited;

  const base = appOrigin(req);
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${base}/signin?error=verify`);
  }
  await ready();
  const now = Date.now();
  const { rows } = await pool().query(
    `UPDATE users SET email_verified = $1, verify_token = NULL, verify_token_expires = NULL
     WHERE verify_token = $2 AND verify_token_expires > $3 RETURNING id`,
    [now, token, now],
  );
  return NextResponse.redirect(`${base}/signin?${rows[0] ? "verified=1" : "error=verify"}`);
}
