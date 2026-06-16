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
  // True when a cap (note count / total or per-entry decompressed size) was hit
  // and some entries were intentionally dropped, so callers can tell the user.
  truncated: boolean;
};

export type KeepImportLimits = {
  maxNotes: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
};

// Defaults bound the work a single upload can trigger: a malicious Takeout ZIP
// could otherwise be a zip bomb (tiny file, gigabytes decompressed) or carry
// hundreds of thousands of notes. Generous for any real Keep export.
export const IMPORT_LIMITS: KeepImportLimits = {
  maxNotes: 2_000,
  maxEntryBytes: 2 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
};

// JSZip exposes the declared uncompressed size on the entry's internal _data,
// letting us skip a bomb entry before decompressing it. Read defensively and
// fall back to a post-decompression length check when it isn't available.
type ZipEntryInternals = { _data?: { uncompressedSize?: number } };
function declaredSize(entry: JSZip.JSZipObject): number | null {
  const size = (entry as unknown as ZipEntryInternals)._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

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
  limits: KeepImportLimits = IMPORT_LIMITS,
): Promise<KeepImportParseResult> {
  const lowerName = fileName.toLowerCase();
  const notes: KeepImportNote[] = [];
  let skipped = 0;
  let truncated = false;

  if (lowerName.endsWith(".zip")) {
    const zip = await JSZip.loadAsync(data);
    let decompressed = 0;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !isKeepJsonPath(path)) continue;
      if (notes.length >= limits.maxNotes) {
        truncated = true;
        break;
      }

      // Cheap pre-checks using the declared size, before paying to decompress.
      const declared = declaredSize(entry);
      if (declared !== null && declared > limits.maxEntryBytes) {
        skipped += 1;
        continue;
      }
      if (declared !== null && decompressed + declared > limits.maxTotalBytes) {
        truncated = true;
        break;
      }

      let text: string;
      try {
        text = await entry.async("text");
      } catch {
        skipped += 1;
        continue;
      }
      // Enforce again on the real length for entries that didn't declare a size.
      if (text.length > limits.maxEntryBytes) {
        skipped += 1;
        continue;
      }
      if (decompressed + text.length > limits.maxTotalBytes) {
        truncated = true;
        break;
      }
      decompressed += text.length;

      try {
        const note = noteFromJson(path.split("/").pop() ?? path, text);
        if (note) notes.push(note);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    return { notes, skipped, truncated };
  }

  if (lowerName.endsWith(".json")) {
    const note = noteFromJson(fileName, new TextDecoder().decode(data));
    return { notes: note ? [note] : [], skipped: note ? 0 : 1, truncated: false };
  }

  return { notes: [], skipped: 1, truncated: false };
}
