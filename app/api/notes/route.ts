import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { newId, pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle } from "@/lib/inferTitle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const { rows } = await pool().query<NoteRow>(
      `SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC`,
      [session.user.id],
    );
    return NextResponse.json({ notes: rows.map(rowToNote) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const body = await req.json();
    const noteBody = String(body.body ?? "");
    const id = newId();
    const now = Date.now();
    const { rows } = await pool().query<NoteRow>(
      `INSERT INTO notes (id, user_id, title, body, tint, pinned, archived, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING *`,
      [
        id,
        session.user.id,
        String(body.title ?? "") || inferNoteTitle(noteBody),
        noteBody,
        String(body.tint ?? "natural"),
        Boolean(body.pinned ?? false),
        Boolean(body.archived ?? false),
        now,
      ],
    );
    return NextResponse.json({ note: rowToNote(rows[0]) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}
