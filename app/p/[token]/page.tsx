import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { looksLikeMarkdown } from "@/lib/markdown";
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

function DownloadMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 2v8.5M4.5 7l3.5 3.5L11.5 7" />
      <path d="M3 13.5h10" />
    </svg>
  );
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
  const isMarkdown = looksLikeMarkdown(note.body);

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
              <div className="flex gap-1.5">
                <dt className="text-[var(--color-muted)]">Updated</dt>
                <dd>{formatDate(note.updatedAt)}</dd>
              </div>
            </dl>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`/p/${params.token}.txt`}
                download
                aria-label="Download as .txt"
                title="Download as .txt"
                className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                <DownloadMark />
              </a>
              <CopyNoteButton text={note.body} />
            </div>
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
