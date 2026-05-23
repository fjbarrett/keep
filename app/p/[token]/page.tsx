import { notFound } from "next/navigation";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadShared(token: string) {
  await ready();
  const { rows } = await pool().query<NoteRow>(
    `SELECT * FROM notes WHERE share_token = $1 AND trashed = false LIMIT 1`,
    [token],
  );
  return rows[0] ? rowToNote(rows[0]) : null;
}

function displayTitle(title: string, body: string) {
  if (needsInferredTitle(title, body)) {
    return inferNoteTitle(body || title) || "Untitled";
  }
  return title || "Untitled";
}

function formatDate(t: number) {
  return new Date(t).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function SharedNotePage({
  params,
}: {
  params: { token: string };
}) {
  const note = await loadShared(params.token);
  if (!note) notFound();

  const title = displayTitle(note.title, note.body);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <article className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          {title}
        </h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Updated {formatDate(note.updatedAt)}
        </p>
        <div className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-[var(--color-text)]">
          {note.body}
        </div>
      </article>

      <footer className="mt-12 text-xs text-[var(--color-muted)]">
        Shared via{" "}
        <a href="/" className="text-[var(--color-link)] hover:underline">
          Keep
        </a>
      </footer>
    </main>
  );
}
