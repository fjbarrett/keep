import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, ready } from "@/lib/db";
import { internalError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VersionRow = {
  id: string;
  note_id: string;
  body: string;
  title: string;
  created_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ready();
    const { rows: noteCheck } = await pool().query(
      `SELECT id FROM notes WHERE id = $1 AND user_id = $2`,
      [params.id, session.user.id],
    );
    if (!noteCheck[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows } = await pool().query<VersionRow>(
      `SELECT id, note_id, body, title, created_at
       FROM note_versions
       WHERE note_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [params.id],
    );

    return NextResponse.json({
      versions: rows.map((r) => ({
        id: r.id,
        noteId: r.note_id,
        body: r.body,
        title: r.title,
        createdAt: Number(r.created_at),
      })),
    });
  } catch (err) {
    return internalError("notes:versions", err);
  }
}
