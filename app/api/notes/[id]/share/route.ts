import crypto from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newShareToken() {
  // 4 random bytes → 8-char uppercase hex (~4.3B keyspace). Short and pretty
  // in URLs; existing longer tokens still work because they're opaque strings.
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const token = newShareToken();
    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes
         SET share_token = COALESCE(share_token, $1), updated_at = $2
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
      [token, Date.now(), params.id, session.user.id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes
         SET share_token = NULL, updated_at = $1
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
      [Date.now(), params.id, session.user.id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}
