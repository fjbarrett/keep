import { auth } from "@/auth";
import { pool, ready } from "@/lib/db";
import { hashPassword, passwordIssue, verifyPassword } from "@/lib/password";
import { isSameOriginMutation } from "@/lib/appUrl";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { internalError } from "@/lib/apiError";
import { recordSecurityEvent } from "@/lib/audit";

export const runtime = "nodejs";
const limit = createTokenBucketRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
export async function POST(req: Request) {
  if (!isSameOriginMutation(req)) return Response.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!limit(session.user.id).allowed) return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  let body: unknown;
  try { body = await readJsonBody(req, 16 * 1024); }
  catch (error) { return requestBodyError(error) ?? Response.json({ error: "Invalid request." }, { status: 400 }); }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const password = typeof input.password === "string" ? input.password : "";
  const current = typeof input.currentPassword === "string" ? input.currentPassword : "";
  const issue = passwordIssue(password);
  if (issue) return Response.json({ error: issue }, { status: 400 });
  try {
    await ready();
    const { rows } = await pool().query<{ password_hash: string | null; email_verified: string | null }>(
      "SELECT password_hash, email_verified FROM users WHERE id = $1", [session.user.id]);
    const user = rows[0];
    if (!user?.email_verified) return Response.json({ error: "Verify your email before setting a password." }, { status: 403 });
    if (user.password_hash) {
      if (current.length > 1024 || !await verifyPassword(current, user.password_hash)) {
        return Response.json({ error: "The current password is incorrect." }, { status: 403 });
      }
    } else if (!session.authenticatedAt || Date.now() - session.authenticatedAt > 10 * 60_000) {
      return Response.json({ error: "Sign out and sign in again before adding a password." }, { status: 403 });
    }
    const hash = await hashPassword(password);
    const updated = await pool().query(
      `UPDATE users SET password_hash = $1, updated_at = $2, session_version = session_version + 1
       WHERE id = $3 AND password_hash IS NOT DISTINCT FROM $4 RETURNING id`,
      [hash, Date.now(), session.user.id, user.password_hash]);
    if (!updated.rows[0]) return Response.json({ error: "The account changed. Sign in and try again." }, { status: 409 });
    await recordSecurityEvent("password.change", { userId: session.user.id, headers: req.headers });
    return Response.json({ ok: true });
  } catch (error) { return internalError("auth:password", error); }
}
