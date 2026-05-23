import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { CopyNoteButton } from "@/components/CopyNoteButton";

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

function isSameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export default async function SharedNotePage({
  params,
}: {
  params: { token: string };
}) {
  const note = await loadShared(params.token);
  if (!note) notFound();

  const title = displayTitle(note.title, note.body);
  const isMarkdown = Boolean(note.markdown);
  const sameDay = isSameDay(note.createdAt, note.updatedAt);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[680px] flex-col px-5 py-10 sm:px-8 sm:py-16">
      <article className="my-auto">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-4xl">
            {title}
          </h1>
          <div className="mt-3 flex items-start justify-between gap-3">
            <dl className="space-y-0.5 text-sm text-[var(--color-muted)]">
              <div className="flex gap-1.5">
                <dt className="text-[var(--color-muted)]">Created</dt>
                <dd>{formatDate(note.createdAt)}</dd>
              </div>
              {!sameDay && (
                <div className="flex gap-1.5">
                  <dt className="text-[var(--color-muted)]">Updated</dt>
                  <dd>{formatDate(note.updatedAt)}</dd>
                </div>
              )}
            </dl>
            <CopyNoteButton text={note.body} />
          </div>
        </header>
        {isMarkdown ? (
          <div className="prose prose-invert prose-lg max-w-none prose-headings:tracking-tight prose-headings:text-[var(--color-text)] prose-p:text-[var(--color-text)] prose-strong:text-[var(--color-text)] prose-a:text-[var(--color-link)] prose-code:text-[var(--color-text)] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[var(--color-surface)] prose-blockquote:border-[var(--color-border)] prose-blockquote:text-[var(--color-muted)] prose-hr:border-[var(--color-border)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {note.body}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[17px] leading-[1.75] text-[var(--color-text)] sm:text-lg sm:leading-[1.8]">
            {note.body}
          </div>
        )}
      </article>

      <footer className="mt-16 pt-6 text-xs text-[var(--color-muted)]">
        Shared via{" "}
        <a href="/" className="text-[var(--color-link)] hover:underline">
          Keep
        </a>
      </footer>
    </main>
  );
}
