import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { noteFileExtension } from "@/lib/detectLanguage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reached via the /p/<token>.txt → /p/<token>/raw.txt rewrite in middleware.
// Returns the note body as text/plain, with a Content-Disposition that hints
// a sensible filename to browsers prompting a download.
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  await ready();
  const { rows } = await pool().query<NoteRow>(
    `SELECT * FROM notes WHERE share_token = $1 AND trashed = false LIMIT 1`,
    [params.token],
  );
  if (!rows[0]) {
    return new Response("Not found", { status: 404 });
  }

  const note = rowToNote(rows[0]);
  const title = needsInferredTitle(note.title, note.body)
    ? inferNoteTitle(note.body || note.title) || "note"
    : note.title || "note";
  const ext = noteFileExtension(note.body);

  return new Response(note.body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeFilename(title)}.${ext}"`,
      "Cache-Control": "no-store",
    },
  });
}

function safeFilename(name: string) {
  return name
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "note";
}
