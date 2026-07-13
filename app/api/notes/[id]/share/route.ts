import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { internalError, isUniqueViolation } from "@/lib/apiError";
import { recordSecurityEvent } from "@/lib/audit";
import { newShareToken } from "@/lib/shareToken";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_SHARE_BODY = 2 * 1024;

export async function POST(
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
    const token = newShareToken();
    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes
         SET share_token = COALESCE(share_token, $1), updated_at = $2
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
      [token, Date.now(), id, session.user.id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    void recordSecurityEvent("share.create", {
      userId: session.user.id,
      headers: req.headers,
      meta: { noteId: id },
    });
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    return internalError("notes:share", err);
  }
}

export async function DELETE(
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
    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes
         SET share_token = NULL, updated_at = $1
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
      [Date.now(), id, session.user.id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    void recordSecurityEvent("share.revoke", {
      userId: session.user.id,
      headers: req.headers,
      meta: { noteId: id },
    });
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    return internalError("notes:share", err);
  }
}

// Set a custom (vanity) share token on a note.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_SHARE_BODY);
  } catch (err) {
    const tooLarge = requestBodyError(err);
    if (tooLarge) return tooLarge;
    body = null;
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) {
    return NextResponse.json(
      { error: "Use 16–40 letters, numbers, dashes or underscores." },
      { status: 400 },
    );
  }
  try {
    await ready();
    const taken = await pool().query(
      `SELECT id FROM notes WHERE share_token = $1 AND id <> $2`,
      [token, id],
    );
    if (taken.rows[0]) {
      return NextResponse.json({ error: "That link is already taken." }, { status: 409 });
    }
    const { rows } = await pool().query<NoteRow>(
      `UPDATE notes SET share_token = $1, updated_at = $2
         WHERE id = $3 AND user_id = $4 RETURNING *`,
      [token, Date.now(), id, session.user.id],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    void recordSecurityEvent("share.create", {
      userId: session.user.id,
      headers: req.headers,
      meta: { noteId: id, custom: true },
    });
    return NextResponse.json({ note: rowToNote(rows[0]) });
  } catch (err) {
    // Two concurrent PUTs can both pass the SELECT above and race on the
    // unique index; turn that into a clean 409 instead of a leaked 500.
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "That link is already taken." },
        { status: 409 },
      );
    }
    return internalError("notes:share", err);
  }
}
