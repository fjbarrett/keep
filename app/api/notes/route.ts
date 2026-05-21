import { NextResponse } from "next/server";
import { newId, pool, ready, rowToNote, NoteRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ready();
    const { rows } = await pool().query<NoteRow>(
      `SELECT * FROM notes ORDER BY updated_at DESC`,
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
  try {
    await ready();
    const body = await req.json();
    const id = newId();
    const now = Date.now();
    const { rows } = await pool().query<NoteRow>(
      `INSERT INTO notes (id, title, body, tint, pinned, archived, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING *`,
      [
        id,
        String(body.title ?? ""),
        String(body.body ?? ""),
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
