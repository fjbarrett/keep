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
 * Renders the note body to a paginated PDF and downloads it. jsPDF is loaded on
 * demand so it never ships in the main bundle. The note's own line breaks are
 * kept; long lines wrap to the page width.
 */
export async function downloadNotePdf(body: string) {
  if (!body.trim()) return;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  const lineH = 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = margin;
  for (const raw of body.split("\n")) {
    const wrapped = raw.trim() ? doc.splitTextToSize(raw, maxW) : [""];
    for (const line of wrapped) {
      if (y + lineH > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineH;
    }
  }
  doc.save(`${noteBaseName(body)}.pdf`);
}
