import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { internalError } from "@/lib/apiError";
import { isNoteColor } from "@/lib/noteColors";
import {
  MAX_NOTE_BODY,
  MAX_NOTE_REQUEST_BYTES,
  MAX_NOTE_SUMMARY,
  MAX_NOTE_TITLE,
  tagsInvalid,
} from "@/lib/noteLimits";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";
import { deletePrivateFile } from "@/lib/storage";

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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const parsed = await readJsonBody(req, MAX_NOTE_REQUEST_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid note update." }, { status: 400 });
    }
    const patch = parsed as Record<string, unknown>;
    const expected = patch.expectedUpdatedAt;
    if (expected !== undefined && (typeof expected !== "number" ||
        !Number.isSafeInteger(expected) || expected < 0)) {
      return NextResponse.json({ error: "Invalid note version." }, { status: 400 });
    }

    // Validate the few client-controlled fields before they reach SQL.
    if ("color" in patch && patch.color !== null && !isNoteColor(patch.color)) {
      return NextResponse.json({ error: "Unknown color." }, { status: 400 });
    }
    if ("body" in patch && typeof patch.body !== "string") {
      return NextResponse.json({ error: "Invalid note body." }, { status: 400 });
    }
    if (typeof patch.body === "string" && patch.body.length > MAX_NOTE_BODY) {
      return NextResponse.json({ error: "Note is too large." }, { status: 413 });
    }
    if ("title" in patch && (typeof patch.title !== "string" || patch.title.length > MAX_NOTE_TITLE)) {
      return NextResponse.json({ error: "Invalid title." }, { status: 400 });
    }
    if (
      "summary" in patch &&
      patch.summary !== null &&
      (typeof patch.summary !== "string" || patch.summary.length > MAX_NOTE_SUMMARY)
    ) {
      return NextResponse.json({ error: "Invalid summary." }, { status: 400 });
    }
    for (const key of ["pinned", "archived", "trashed", "markdown", "highlight"]) {
      if (key in patch && typeof patch[key] !== "boolean") {
        return NextResponse.json({ error: `Invalid ${key} value.` }, { status: 400 });
      }
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
    sets.push(`updated_at = GREATEST(updated_at + 1, $${i++})`);
    values.push(Date.now());
    const idPlaceholder = `$${i++}`;
    const userPlaceholder = `$${i++}`;
    values.push(id);
    values.push(session.user.id);

    if (sets.length === 1) {
      // only updated_at — nothing meaningful changed
      const { rows } = await pool().query<NoteRow>(
        `SELECT * FROM notes WHERE id = $1 AND user_id = $2`,
        [id, session.user.id],
      );
      if (!rows[0])
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ note: rowToNote(rows[0]) });
    }

    const versionClause = expected === undefined ? "" : ` AND updated_at = $${i++}`;
    if (expected !== undefined) values.push(expected);
    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes SET ${sets.join(", ")}
         WHERE id = ${idPlaceholder} AND user_id = ${userPlaceholder}${versionClause}
         RETURNING *`,
      values,
    );
    if (!rows[0]) {
      if (expected !== undefined) {
        const current = await pool().query<NoteRow>(
          "SELECT * FROM notes WHERE id = $1 AND user_id = $2", [id, session.user.id],
        );
        if (current.rows[0]) {
          return NextResponse.json({
            error: "This note changed elsewhere. Save a copy or reload before retrying.",
            note: rowToNote(current.rows[0]),
          }, { status: 409 });
        }
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    const tooLarge = requestBodyError(err, "Note is too large.");
    if (tooLarge) return tooLarge;
    return internalError("notes:item", err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const { rows } = await pool().query<{ body: string }>(
      `DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING body`,
      [id, session.user.id],
    );
    const uploadIds = new Set(
      [...(rows[0]?.body ?? "").matchAll(/\/api\/uploads\/([0-9a-f]{32})/g)]
        .map((match) => match[1]),
    );
    for (const uploadId of uploadIds) {
      const reference = `/api/uploads/${uploadId}`;
      const stillUsed = await pool().query(
        `SELECT 1 FROM notes WHERE user_id = $1 AND position($2 in body) > 0 LIMIT 1`,
        [session.user.id, reference],
      );
      if (stillUsed.rows[0]) continue;
      const removed = await pool().query<{ storage_key: string }>(
        `DELETE FROM uploads WHERE id = $1 AND user_id = $2 RETURNING storage_key`,
        [uploadId, session.user.id],
      );
      if (removed.rows[0]) {
        await deletePrivateFile(removed.rows[0].storage_key).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("notes:item", err);
  }
}
