import type { Note } from "./types";

function noteText(note: Note): string {
  return note.body.trim() || note.title.trim();
}

function sanitizeName(value: string): string {
  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim()
    .slice(0, 60);
  return normalized || "note";
}

export function noteFileName(note: Note): string {
  const firstLine = noteText(note).split("\n")[0] ?? "";
  return `${sanitizeName(firstLine)}-${note.id.slice(-6)}.txt`;
}

export function noteFileContent(note: Note): string {
  return `${noteText(note)}\n`;
}
