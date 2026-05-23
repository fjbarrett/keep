import JSZip from "jszip";

type KeepListItem = {
  text?: unknown;
  isChecked?: unknown;
};

type KeepJson = {
  title?: unknown;
  textContent?: unknown;
  listContent?: unknown;
  isArchived?: unknown;
  isPinned?: unknown;
  isTrashed?: unknown;
  createdTimestampUsec?: unknown;
  userEditedTimestampUsec?: unknown;
};

export type KeepImportNote = {
  sourceName: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;
};

export type KeepImportParseResult = {
  notes: KeepImportNote[];
  skipped: number;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function timestampFromUsec(value: unknown) {
  const raw =
    typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(raw) ? Math.floor(raw / 1000) : Date.now();
}

function bodyFromKeepJson(note: KeepJson) {
  const title = stringValue(note.title);
  const text = stringValue(note.textContent);
  const blocks: string[] = [];

  if (title) blocks.push(title);

  if (Array.isArray(note.listContent)) {
    const items = note.listContent
      .map((item: KeepListItem) => {
        const itemText = stringValue(item.text);
        if (!itemText) return "";
        return `- [${item.isChecked ? "x" : " "}] ${itemText}`;
      })
      .filter(Boolean);
    if (items.length > 0) blocks.push(items.join("\n"));
  } else if (text) {
    blocks.push(text);
  }

  return blocks.join("\n\n").trim();
}

function noteFromJson(sourceName: string, raw: string): KeepImportNote | null {
  const json = JSON.parse(raw) as KeepJson;
  const body = bodyFromKeepJson(json);
  if (!body) return null;

  const archived = Boolean(json.isArchived);
  const createdAt = timestampFromUsec(json.createdTimestampUsec);
  return {
    sourceName,
    body,
    pinned: Boolean(json.isPinned) && !archived,
    archived,
    trashed: Boolean(json.isTrashed),
    createdAt,
    updatedAt: timestampFromUsec(json.userEditedTimestampUsec) || createdAt,
  };
}

function isKeepJsonPath(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith(".json") &&
    (normalized.startsWith("keep/") || normalized.includes("/keep/"))
  );
}

export async function parseGoogleKeepImport(
  fileName: string,
  data: ArrayBuffer,
): Promise<KeepImportParseResult> {
  const lowerName = fileName.toLowerCase();
  const notes: KeepImportNote[] = [];
  let skipped = 0;

  if (lowerName.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(data);
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !isKeepJsonPath(path)) continue;
      try {
        const note = noteFromJson(path.split("/").pop() ?? path, await entry.async("text"));
        if (note) notes.push(note);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    return { notes, skipped };
  }

  if (lowerName.endsWith(".json")) {
    const note = noteFromJson(fileName, new TextDecoder().decode(data));
    return { notes: note ? [note] : [], skipped: note ? 0 : 1 };
  }

  return { notes: [], skipped: 1 };
}
