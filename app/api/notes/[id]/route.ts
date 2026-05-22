import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle } from "@/lib/inferTitle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["title", "body", "tint", "pinned", "archived"]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const patch = await req.json();
    if (
      patch &&
      typeof patch === "object" &&
      typeof patch.body === "string" &&
      patch.title === undefined
    ) {
      patch.title = inferNoteTitle(patch.body);
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      if (!ALLOWED.has(k)) continue;
      sets.push(`${k} = $${i++}`);
      values.push(v);
    }
    sets.push(`updated_at = $${i++}`);
    values.push(Date.now());
    const idPlaceholder = `$${i++}`;
    const userPlaceholder = `$${i++}`;
    values.push(params.id);
    values.push(session.user.id);

    if (sets.length === 1) {
      // only updated_at — nothing meaningful changed
      const { rows } = await pool().query<NoteRow>(
        `SELECT * FROM notes WHERE id = $1 AND user_id = $2`,
        [params.id, session.user.id],
      );
      if (!rows[0])
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ note: rowToNote(rows[0]) });
    }

    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes SET ${sets.join(", ")}
         WHERE id = ${idPlaceholder} AND user_id = ${userPlaceholder}
         RETURNING *`,
      values,
    );
    if (!rows[0])
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    await pool().query(
      `DELETE FROM notes WHERE id = $1 AND user_id = $2`,
      [params.id, session.user.id],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}
