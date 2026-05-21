import { NextResponse } from "next/server";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "title",
  "body",
  "tint",
  "pinned",
  "archived",
]);

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await ready();
    const patch = await req.json();
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
    values.push(params.id);

    if (sets.length === 1) {
      // only updated_at — nothing meaningful changed
      const { rows } = await pool().query<NoteRow>(
        `SELECT * FROM notes WHERE id = $1`,
        [params.id],
      );
      if (!rows[0])
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ note: rowToNote(rows[0]) });
    }

    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
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
  try {
    await ready();
    await pool().query(`DELETE FROM notes WHERE id = $1`, [params.id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}
