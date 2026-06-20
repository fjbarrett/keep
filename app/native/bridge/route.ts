import { auth } from "@/auth";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { pool, ready } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 60_000;

// Where Google sign-in lands after completing. By now NextAuth has set the
// session cookie on this origin — but it lives in the system browser's cookie
// jar, out of reach of the app's URLSession. Mint a single-use code bound to
// that cookie and bounce to the app's custom scheme; /api/native/exchange
// trades the code back for the cookie so the native client becomes authed.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Sign-in did not complete.", { status: 401 });
  }

  // The session JWT is small (sub/name/email), so NextAuth never chunks it into
  // .0/.1 cookies — the single token cookie is enough. Match both the dev
  // (`authjs.session-token`) and prod (`__Secure-…`) names.
  const jar = await cookies();
  const sessionCookie = jar
    .getAll()
    .find((c) => c.name.endsWith("authjs.session-token"));
  if (!sessionCookie) {
    return new Response("No session cookie.", { status: 401 });
  }

  const code = randomBytes(32).toString("base64url");
  await ready();
  await pool().query(`DELETE FROM native_auth_codes WHERE expires_at < $1`, [
    Date.now(),
  ]);
  await pool().query(
    `INSERT INTO native_auth_codes (code, cookie_name, cookie_value, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, sessionCookie.name, sessionCookie.value, Date.now() + CODE_TTL_MS],
  );

  return new Response(null, {
    status: 302,
    headers: { Location: `keep://auth-callback?code=${encodeURIComponent(code)}` },
  });
}
