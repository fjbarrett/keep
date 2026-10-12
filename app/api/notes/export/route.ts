import { downloadDisposition } from "@/lib/downloadDisposition";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { noteFileContent, noteFileName, notesZip } from "@/lib/noteExport";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { internalError } from "@/lib/apiError";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const exportLimit = createTokenBucketRateLimiter({ limit: 3, windowMs: 60_000 });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!exportLimit(session.user.id).allowed) {
    return NextResponse.json({ error: "Too many exports. Try again in a minute." }, { status: 429 });
  }

  try {
    await ready();
    const client = await pool().connect();
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      try { await client.query("ROLLBACK"); } finally { client.release(); }
    };
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query(`DECLARE note_export NO SCROLL CURSOR FOR
        SELECT * FROM notes WHERE user_id = $1 AND trashed = false ORDER BY updated_at DESC`, [session.user.id]);
      const first = await client.query<NoteRow>("FETCH 2 FROM note_export");
      if (first.rows.length < 2) {
        await close();
        if (!first.rows.length) return NextResponse.json({ error: "No notes to export" }, { status: 404 });
        const note = rowToNote(first.rows[0]);
        return new NextResponse(noteFileContent(note), { headers: {
          "Content-Disposition": downloadDisposition("attachment", noteFileName(note)),
          "Content-Type": "text/plain; charset=utf-8",
        } });
      }
      async function* notes() {
        try {
          for (const row of first.rows) yield rowToNote(row);
          while (true) {
            const batch = await client.query<NoteRow>("FETCH 16 FROM note_export");
            if (!batch.rows.length) break;
            for (const row of batch.rows) yield rowToNote(row);
          }
        } finally { await close(); }
      }
      const chunks = notesZip(notes());
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await chunks.next();
            if (chunk.done) controller.close();
            else controller.enqueue(chunk.value);
          } catch (error) { await close(); controller.error(error); }
        },
        async cancel() {
          try { await chunks.return(undefined); } finally { await close(); }
        },
      });
      return new NextResponse(body, { headers: {
        "Content-Disposition": 'attachment; filename="keep-notes.zip"',
        "Content-Type": "application/zip",
      } });
    } catch (error) { await close(); throw error; }
  } catch (error) { return internalError("notes:export", error); }
}
