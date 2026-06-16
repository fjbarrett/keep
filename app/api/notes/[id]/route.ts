import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { newId, pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { internalError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Version-history coalescing: keep at most one restore point per window of
// rapid edits, plus an extra one whenever a single edit is large.
const VERSION_COALESCE_MS = 2 * 60_000;
const VERSION_MIN_CHARS = 200;

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

    if (typeof patch.body === "string") {
      const { rows: current } = await pool().query<NoteRow>(
        `SELECT * FROM notes WHERE id = $1 AND user_id = $2`,
        [params.id, session.user.id],
      );
      if (current[0] && current[0].body !== patch.body) {
        // Autosave fires every ~0.5s, so snapshotting every change buried the
        // history in near-identical entries. Coalesce rapid edits into one
        // restore point: only snapshot when the last one is old enough, or the
        // edit since it is large enough to be worth keeping.
        const { rows: last } = await pool().query<{ created_at: string; body: string }>(
          `SELECT created_at, body FROM note_versions
           WHERE note_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [params.id],
        );
        const ref = last[0]?.body ?? current[0].body;
        const enoughTime =
          !last[0] || Date.now() - Number(last[0].created_at) > VERSION_COALESCE_MS;
        const bigChange = Math.abs(patch.body.length - ref.length) >= VERSION_MIN_CHARS;
        if (enoughTime || bigChange) {
          await pool().query(
            `INSERT INTO note_versions (id, note_id, body, title, created_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [newId(), params.id, current[0].body, current[0].title, current[0].updated_at],
          );
        }
      }
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
