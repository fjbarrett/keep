// GET  — returns the caller's enc_salt, or null if encryption is not yet set up.
// POST — sets the enc_salt for the first time; ignored if already set.
//
// The salt is not secret: it individualises the PBKDF2 key so two users with
// the same passphrase get different keys. The server never sees the passphrase
// or the derived key — only the salt and the resulting ciphertext.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ready();
  const { rows } = await pool().query<{ enc_salt: string | null }>(
    "SELECT enc_salt FROM users WHERE id = $1",
    [session.user.id],
  );
  return NextResponse.json({ salt: rows[0]?.enc_salt ?? null });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { salt } = await req.json() as { salt?: string };
  if (!salt || !/^[0-9a-f]{64}$/.test(salt)) {
    return NextResponse.json({ error: "salt must be 64 lowercase hex chars" }, { status: 400 });
  }
  await ready();
  // Only set if not already present — changing the salt would make all existing
  // ciphertext unrecoverable.
  await pool().query(
    "UPDATE users SET enc_salt = $1 WHERE id = $2 AND enc_salt IS NULL",
    [salt, session.user.id],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ready();
  await pool().query("UPDATE users SET enc_salt = NULL WHERE id = $1", [session.user.id]);
  return NextResponse.json({ ok: true });
}
