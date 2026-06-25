import { noteFileExtension } from "./detectLanguage";

// Strip filesystem-reserved characters from the filename; keep spaces/hyphens.
const RESERVED = /[<>:"/|?*]/g;

/** Filename base from the first non-empty line (shared by every export). */
function noteBaseName(body: string): string {
  const first = body.split("\n").find((l) => l.trim()) ?? "note";
  return first.replace(/^#{1,6}\s+/, "").replace(RESERVED, "").trim().slice(0, 50) || "note";
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Triggers a client-side download of a note body as
 * `<first-non-empty-line>.<detected-ext>` (same naming + extension detection the
 * editor toolbar and the public page use).
 */
export function downloadNoteBody(body: string) {
  if (!body.trim()) return;
  const ext = noteFileExtension(body);
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${noteBaseName(body)}.${ext}`);
}

/**
 * Renders the note body to a paginated PDF and downloads it. The Markdown is
 * lexed and laid out with real typography (headings, emphasis, lists, code,
 * tables) rather than dumping the raw syntax — see `notePdf.ts`. jsPDF, marked
 * and the renderer are all loaded on demand so none ship in the main bundle.
 */
export async function downloadNotePdf(body: string) {
  if (!body.trim()) return;
  const [{ jsPDF }, { lexer }, { renderMarkdownPdf }] = await Promise.all([
    import("jspdf"),
    import("marked"),
    import("./notePdf"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderMarkdownPdf(doc, lexer(body));
  doc.save(`${noteBaseName(body)}.pdf`);
}
