import { Note } from "@/lib/types";

function noteText(note: Note) {
  return note.body.trim() || note.title.trim();
}

function noteFileName(note: Note) {
  const base =
    noteText(note)
      .split("\n")[0]
      ?.replace(/\s+/g, " ")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .trim()
      .slice(0, 60) || "note";
  return `${base}-${note.id.slice(-6)}.txt`;
}

function noteFileContent(note: Note) {
  return `${noteText(note)}\n`;
}

function downloadBlob(fileName: string, content: BlobPart, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportGuestNotes(notes: Note[]) {
  const exportable = notes.filter((note) => !note.trashed);
  if (exportable.length === 0) return;
  if (exportable.length === 1) {
    downloadBlob(
      noteFileName(exportable[0]),
      noteFileContent(exportable[0]),
      "text/plain",
    );
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const note of exportable) {
    zip.file(noteFileName(note), noteFileContent(note));
  }
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob("keep-texts.zip", content, "application/zip");
}
