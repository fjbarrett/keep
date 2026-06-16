import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { noteFileExtension } from "@/lib/detectLanguage";
import { CopyNoteButton } from "@/components/CopyNoteButton";
import { MarkdownCodeBlock } from "@/components/MarkdownCodeBlock";

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

function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s/m.test(text)
    || /\*\*\w/.test(text)
    || /```/.test(text)
    || /^\s*[-*+]\s/m.test(text)
    || /^\s*\d+\.\s/m.test(text)
    || /\[.*\]\(.*\)/.test(text)
    || /^>\s/m.test(text);
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
  const isMarkdown = looksLikeMarkdown(note.body);
  const sameDay = isSameDay(note.createdAt, note.updatedAt);
  const downloadExt = noteFileExtension(note.body);

  const hasTags = note.tags && note.tags.length > 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[680px] flex-col px-5 py-10 sm:px-8 sm:py-16">
      <article className="my-auto">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-4xl">
            {title}
          </h1>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-[var(--color-muted)]">
                <div className="flex gap-1.5">
                  <dt>Created</dt>
                  <dd>{formatDate(note.createdAt)}</dd>
                </div>
                {!sameDay && (
                  <div className="flex gap-1.5">
                    <dt>Updated</dt>
                    <dd>{formatDate(note.updatedAt)}</dd>
                  </div>
                )}
              </dl>
              {hasTags && (
                <div className="flex flex-wrap gap-1.5">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--color-surface-hover)] px-2.5 py-0.5 text-xs text-[var(--color-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`/p/${params.token}.${downloadExt}`}
                download
                aria-label={`Download as .${downloadExt}`}
                title={`Download as .${downloadExt}`}
                className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                <DownloadMark />
              </a>
              <CopyNoteButton
                text={note.body}
                contentSelector={isMarkdown ? "[data-note-content]" : undefined}
              />
            </div>
          </div>
        </header>

        <div className="mb-8 border-t border-[var(--color-border)]" />

        {isMarkdown ? (
          <div
            data-note-content
            className="prose-invert-auto max-w-none text-base leading-relaxed sm:text-[17px] sm:leading-[1.75]"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ pre: MarkdownCodeBlock }}
            >
              {note.body}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[17px] leading-[1.75] text-[var(--color-text)] sm:text-lg sm:leading-[1.8]">
            {note.body}
          </div>
        )}
      </article>

      <footer className="mt-16 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-muted)]">
        Shared via{" "}
        <a href="/" className="text-[var(--color-link)] hover:underline">
          Keep
        </a>
      </footer>
    </main>
  );
}
