import { noteFileExtension } from "./detectLanguage";

// Strip filesystem-reserved characters from the filename; keep spaces/hyphens.
const RESERVED = /[<>:"/|?*]/g;

/**
 * Triggers a client-side download of a note body as
 * `<first-non-empty-line>.<detected-ext>` (same naming + extension detection the
 * editor toolbar and the public page use).
 */
export function downloadNoteBody(body: string) {
  if (!body.trim()) return;
  const ext = noteFileExtension(body);
  const first = body.split("\n").find((l) => l.trim()) ?? "note";
  const base = first.replace(/^#{1,6}\s+/, "").replace(RESERVED, "").trim().slice(0, 50) || "note";
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
