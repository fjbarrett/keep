import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { internalError } from "@/lib/apiError";
import { isNoteColor } from "@/lib/noteColors";
import { MAX_NOTE_BODY, tagsInvalid } from "@/lib/noteLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "title",
  "summary",
  "color",
  "body",
  "pinned",
  "archived",
  "trashed",
  "markdown",
  "highlight",
  "tags",
]);

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

    // Validate the few client-controlled fields before they reach SQL.
    if ("color" in patch && patch.color !== null && !isNoteColor(patch.color)) {
      return NextResponse.json({ error: "Unknown color." }, { status: 400 });
    }
    if (typeof patch.body === "string" && patch.body.length > MAX_NOTE_BODY) {
      return NextResponse.json({ error: "Note is too large." }, { status: 413 });
    }
    if ("tags" in patch && tagsInvalid(patch.tags)) {
      return NextResponse.json({ error: "Invalid tags." }, { status: 400 });
    }

    // Title/summary are generated client-side (gated to meaningful edits) and
    // sent in the patch, so the server no longer regenerates on every autosave.
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
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    return internalError("notes:item", err);
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
    return internalError("notes:item", err);
  }
}
