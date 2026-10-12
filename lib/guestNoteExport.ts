import { Note } from "@/lib/types";

import { noteFileName, noteFileContent } from "./noteTextExport";
import { downloadBlob } from "./downloadNote";

export async function exportGuestNotes(notes: Note[]) {
  const exportable = notes.filter((note) => !note.trashed);
  if (exportable.length === 0) return;
  if (exportable.length === 1) {
    downloadBlob(
      new Blob([noteFileContent(exportable[0])], { type: "text/plain" }),
      noteFileName(exportable[0]),
    );
    return;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const note of exportable) {
    zip.file(noteFileName(note), noteFileContent(note));
  }
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, "keep-notes.zip");
}
