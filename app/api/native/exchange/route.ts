import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Matches Keep's seven-day session lifetime so the cookie persists in the
// app's cookie store across launches (a bare session cookie would be dropped on
// quit). The JWT's own exp still governs validity — an expired token 401s and
// the app re-runs sign-in.
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const MAX_EXCHANGE_BODY = 2 * 1024;

// Trades the one-time code minted by /native/bridge for the session cookie, so
// the native app's URLSession becomes authenticated. Public (it runs before a
  // session exists — see the allowlist in proxy.ts); the high-entropy,
// single-use code is the credential, so there is nothing to leak without it.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_EXCHANGE_BODY);
  } catch (err) {
    const tooLarge = requestBodyError(err);
    if (tooLarge) return tooLarge;
    body = null;
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const code = typeof input?.code === "string" ? input.code : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  await ready();
  // DELETE … RETURNING claims the code atomically, so it is spendable exactly
  // once even if two requests race.
  const { rows } = await pool().query<{
    cookie_name: string;
    cookie_value: string;
  }>(
    `DELETE FROM native_auth_codes
     WHERE code = $1 AND expires_at > $2
     RETURNING cookie_name, cookie_value`,
    [code, Date.now()],
  );
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: row.cookie_name,
    value: row.cookie_value,
    httpOnly: true,
    secure: row.cookie_name.startsWith("__Secure-"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return res;
}
