import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { hashPassword, passwordIssue } from "@/lib/password";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";
import { appOrigin, isSameOriginMutation } from "@/lib/appUrl";

export const runtime = "nodejs";

// Tokens are 256-bit and unguessable, but still cap per-IP so the endpoint
// can't be hammered as a redemption oracle or to load the DB.
const verifyRateLimit = createTokenBucketRateLimiter({
  limit: 20,
  windowMs: 60_000,
});

// GET never activates a credential: mail scanners can follow this link safely.
export async function GET(req: Request) {
  const base = appOrigin(req);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(`${base}/${/^[a-f0-9]{64}$/.test(token) ? `signup?token=${token}` : "signin?error=verify"}`);
}

export async function POST(req: Request) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const limited = enforceIpRateLimit(verifyRateLimit, req.headers, "auth-verify", "Too many attempts. Try again shortly.");
  if (limited) return limited;
  let body: unknown;
  try { body = await readJsonBody(req, 8 * 1024); }
  catch (err) { return requestBodyError(err) ?? NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const token = typeof input?.token === "string" ? input.token : "";
  const password = typeof input?.password === "string" ? input.password : "";
  const invalid = () => NextResponse.json({ error: "This link has expired or was already used. Request a new verification link." }, { status: 400 });
  if (!/^[a-f0-9]{64}$/.test(token)) return invalid();
  const issue = passwordIssue(password);
  if (issue) return NextResponse.json({ error: issue }, { status: 400 });
  await ready();
  const pending = await pool().query(
    "SELECT id FROM users WHERE verify_token = $1 AND verify_token_expires > $2 AND email_verified IS NULL",
    [token, Date.now()],
  );
  if (!pending.rows[0]) return invalid();
  const hash = await hashPassword(password);
  const now = Date.now();
  // Redeem the proof and replace any pre-registration credential atomically.
  // A concurrent resend, OAuth adoption, or redemption invalidates this write.
  const { rows } = await pool().query(
    `UPDATE users SET password_hash = $1, email_verified = $2, updated_at = $2,
     verify_token = NULL, verify_token_expires = NULL
     WHERE verify_token = $3 AND verify_token_expires > $2 AND email_verified IS NULL RETURNING id`,
    [hash, now, token],
  );
  return rows[0] ? NextResponse.json({ ok: true }) : invalid();
}
