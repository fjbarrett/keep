import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { newId, pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { generateNoteMeta } from "@/lib/titleModel";

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
    let title = String(body.title ?? "");
    let summary = typeof body.summary === "string" ? body.summary : null;
    // The client normally supplies both (one Haiku call); only fall back to
    // generating here when it didn't.
    if (!title) {
      const meta = await generateNoteMeta(noteBody);
      title = meta.title;
      summary = summary ?? meta.summary;
    }
    const id = newId();
    const now = Date.now();
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    const { rows } = await pool().query<NoteRow>(
      `INSERT INTO notes (id, user_id, title, summary, body, pinned, archived, trashed, markdown, highlight, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11, $11)
       RETURNING *`,
      [
        id,
        session.user.id,
        title,
        summary,
        noteBody,
        Boolean(body.pinned ?? false),
        Boolean(body.archived ?? false),
        Boolean(body.markdown ?? false),
        Boolean(body.highlight ?? false),
        tags,
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
