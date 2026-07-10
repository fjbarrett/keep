import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { auth } from "@/auth";
import { newId, pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { generateNoteMeta } from "@/lib/titleModel";
import { internalError } from "@/lib/apiError";
import {
  MAX_NOTE_BODY,
  MAX_NOTE_SUMMARY,
  MAX_NOTE_TITLE,
  tagsInvalid,
} from "@/lib/noteLimits";
import { isNoteColor } from "@/lib/noteColors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_NOTE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

function noteIdForCreate(userId: string, requested: unknown) {
  if (typeof requested !== "string") return newId();
  if (/^[0-9a-f]{32}$/.test(requested)) return requested;
  // Older guest notes used short/local ids. Derive a stable, account-specific
  // 128-bit id so retries stay idempotent without reintroducing global 32-bit ids.
  return createHash("sha256")
    .update(userId)
    .update("\0")
    .update(requested)
    .digest("hex")
    .slice(0, 32);
}

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
    return internalError("notes:list-create", err);
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
    if (noteBody.length > MAX_NOTE_BODY) {
      return NextResponse.json({ error: "Note is too large." }, { status: 413 });
    }
    if (body.tags !== undefined && tagsInvalid(body.tags)) {
      return NextResponse.json({ error: "Invalid tags." }, { status: 400 });
    }
    if (body.id !== undefined && (typeof body.id !== "string" || !CLIENT_NOTE_KEY.test(body.id))) {
      return NextResponse.json({ error: "Invalid note id." }, { status: 400 });
    }
    if (body.color !== undefined && body.color !== null && !isNoteColor(body.color)) {
      return NextResponse.json({ error: "Unknown color." }, { status: 400 });
    }
    let title = String(body.title ?? "");
    let summary = typeof body.summary === "string" ? body.summary : null;
    if (title.length > MAX_NOTE_TITLE || (summary?.length ?? 0) > MAX_NOTE_SUMMARY) {
      return NextResponse.json({ error: "Note metadata is too large." }, { status: 400 });
    }
    // The client normally supplies both (one Haiku call); only fall back to
    // generating here when it didn't.
    if (!title) {
      const meta = await generateNoteMeta(noteBody);
      title = meta.title;
      summary = summary ?? meta.summary;
    }
    const id = noteIdForCreate(session.user.id, body.id);
    const now = Date.now();
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    const { rows } = await pool().query<NoteRow>(
      `INSERT INTO notes (id, user_id, title, summary, color, body, pinned, archived, trashed, markdown, highlight, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, $12, $12)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [
        id,
        session.user.id,
        title,
        summary,
        body.color ?? null,
        noteBody,
        body.pinned === true,
        body.archived === true,
        body.markdown === true,
        body.highlight === true,
        tags,
        now,
      ],
    );
    if (rows[0]) {
      return NextResponse.json({ note: rowToNote(rows[0]) }, { status: 201 });
    }

    const existing = await pool().query<NoteRow>(
      `SELECT * FROM notes WHERE id = $1 AND user_id = $2`,
      [id, session.user.id],
    );
    if (!existing.rows[0]) {
      return NextResponse.json({ error: "Note id is already in use." }, { status: 409 });
    }
    return NextResponse.json({ note: rowToNote(existing.rows[0]) });
  } catch (err) {
    return internalError("notes:list-create", err);
  }
}
