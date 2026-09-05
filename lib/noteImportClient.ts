import { validateImportedBodies } from "@/lib/noteLimits";
import { Note } from "@/lib/types";
import { localNoteId, metadataForBody } from "@/lib/notesClient";

export async function importGuestKeepFile(file: File) {
  const { parseGoogleKeepImport } = await import("@/lib/googleKeepImport");
  const { notes: imported, skipped } = await parseGoogleKeepImport(
    file.name,
    await file.arrayBuffer(),
  );
  const now = Date.now();
  const importable = imported.filter((note) => !note.trashed);
  validateImportedBodies(importable.map((note) => note.body));
  const notes: Note[] = [];

  for (const note of importable) {
    const metadata = await metadataForBody(note.body);
    notes.push({
      id: localNoteId(),
      title: metadata.title,
      summary: metadata.summary || null,
      body: note.body,
      pinned: note.pinned,
      archived: note.archived,
      trashed: false,
      markdown: false,
      highlight: false,
      tags: [],
      shareToken: null,
      createdAt: note.createdAt || now,
      updatedAt: note.updatedAt || now,
    });
  }

  return {
    notes,
    skipped: skipped + imported.length - importable.length,
  };
}

export async function readImportedTextBodies(file: File): Promise<string[]> {
  if (/\.zip$/i.test(file.name)) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const bodies: string[] = [];
    for (const entry of Object.values(zip.files)) {
      if (!entry.dir && /\.(txt|md|markdown)$/i.test(entry.name)) {
        bodies.push(await entry.async("string"));
      }
    }
    validateImportedBodies(bodies);
    return bodies;
  }

  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
    const { extractPdfText } = await import("@/lib/pdfText");
    const bodies = [await extractPdfText(file)];
    validateImportedBodies(bodies);
    return bodies;
  }

  const bodies = [await file.text()];
  validateImportedBodies(bodies);
  return bodies;
}
