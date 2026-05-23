import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { noteFileContent, noteFileName, notesZip } from "@/lib/noteExport";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";

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
      `SELECT * FROM notes
        WHERE user_id = $1 AND trashed = false
        ORDER BY updated_at DESC`,
      [session.user.id],
    );
    const notes = rows.map(rowToNote);

    if (notes.length === 0) {
      return NextResponse.json({ error: "No notes to export" }, { status: 404 });
    }

    if (notes.length === 1) {
      const note = notes[0];
      return new NextResponse(noteFileContent(note), {
        headers: {
          "Content-Disposition": `attachment; filename="${noteFileName(note)}"`,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    return new NextResponse(new Uint8Array(notesZip(notes)), {
      headers: {
        "Content-Disposition": 'attachment; filename="keep-notes.zip"',
        "Content-Type": "application/zip",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "DB error" },
      { status: 500 },
    );
  }
}
