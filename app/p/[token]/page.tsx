import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pool, ready, rowToNote, NoteRow } from "@/lib/db";
import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { noteFileExtension } from "@/lib/detectLanguage";
import { CopyNoteButton } from "@/components/CopyNoteButton";
import { MarkdownCodeBlock } from "@/components/MarkdownCodeBlock";
import { Logo } from "@/components/Logo";
import type { ComponentProps } from "react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trashing a note revokes its share link; archiving does not. An archived note
// is still readable at /p/<token> by anyone holding it. That may well be the
// intent — archive is a "get it out of my list" gesture, not "unpublish" — but
// nothing states it, so it is recorded here rather than silently changed.
// Same filter in ./raw.txt/route.ts; the two have to agree.
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

function SharedImage({ token, src, ...props }: ComponentProps<"img"> & { token: string }) {
  const authorizedSrc =
    typeof src === "string" && src.startsWith("/api/uploads/")
      ? `${src}?share=${encodeURIComponent(token)}`
      : src;
  return <img {...props} src={authorizedSrc} />;
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
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const note = await loadShared(token);
  if (!note) notFound();

  const title = displayTitle(note.title, note.body);
  const isMarkdown = looksLikeMarkdown(note.body);
  const sameDay = isSameDay(note.createdAt, note.updatedAt);
  const downloadExt = noteFileExtension(note.body);

  const hasTags = note.tags && note.tags.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-canvas)]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-5 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2">
            <Logo />
          </a>
          <div className="flex-1" />
          <a
            href="/"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            Open Keep
          </a>
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-10 pt-2 sm:px-6 sm:pb-16">
        <article className="mx-auto w-full max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8 sm:px-10 sm:py-10">
          <header className="mb-7">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[2rem]">
                {title}
              </h1>
              <div className="flex shrink-0 items-center gap-2 pt-1">
                <a
                  href={`/p/${token}.${downloadExt}`}
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
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-[var(--color-muted)]">
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
              <div className="mt-2 flex flex-wrap gap-1.5">
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
          </header>

          <div className="mb-7 border-t border-[var(--color-border)]" />

          {isMarkdown ? (
            <div
              data-note-content
              className="prose-invert-auto max-w-none text-base leading-relaxed sm:text-[17px] sm:leading-[1.75]"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: MarkdownCodeBlock,
                  img: (props) => <SharedImage {...props} token={token} />,
                }}
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

        <footer className="mx-auto mt-6 w-full max-w-3xl px-1 text-xs text-[var(--color-muted)]">
          Shared via{" "}
          <a href="/" className="text-[var(--color-link)] hover:underline">
            Keep
          </a>
        </footer>
      </main>
    </div>
  );
}
