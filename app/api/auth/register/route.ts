import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { pool, ready, newId } from "@/lib/db";
import { hashPassword, passwordIssue } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
    `INSERT INTO users (id, email, name, password_hash, verify_token, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email, null, hash, token, Date.now()],
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
