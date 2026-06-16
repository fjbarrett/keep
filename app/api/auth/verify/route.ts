import { NextResponse } from "next/server";
import { pool, ready } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const base = (process.env.AUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
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
