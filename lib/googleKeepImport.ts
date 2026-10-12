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

export class InvalidKeepExport extends Error {
  constructor() {
    super("That file isn't a Google Keep export.");
    this.name = "InvalidKeepExport";
  }
}

// The size a zip header declares was written by whoever built the zip, so it
// only short-circuits entries that admit to being too big; inflateBounded is
// what enforces the caps.
type ZipEntryInternals = { _data?: { uncompressedSize?: number } };
function declaredSize(entry: JSZip.JSZipObject): number | null {
  const size = (entry as unknown as ZipEntryInternals)._data?.uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

// JSZip's typings expose only the accumulating `async`; the chunked stream it
// wraps is what lets inflation stop once an entry passes the cap.
type StreamingZipEntry = {
  internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
};

// Stop collecting at the byte cap and pause further compressed input. Count
// all emitted bytes, including rejected entries, against the upload budget.
function inflateBounded(
  entry: JSZip.JSZipObject,
  maxBytes: number,
  budget: { used: number; limit: number },
): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let received = 0;
    let settled = false;
    const stream = (entry as unknown as StreamingZipEntry).internalStream("uint8array");
    stream
      .on("data", (chunk) => {
        budget.used += chunk.length;
        if (settled) return;
        received += chunk.length;
        if (received > maxBytes || budget.used > budget.limit) {
          settled = true;
          stream.pause();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      })
      .on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      })
      .on("end", () => {
        if (settled) return;
        settled = true;
        const bytes = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(bytes);
      })
      .resume();
  });
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
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new InvalidKeepExport();
    }
    const budget = { used: 0, limit: limits.maxTotalBytes };
    let visited = 0;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !isKeepJsonPath(path)) continue;
      if (visited++ >= limits.maxNotes || budget.used >= budget.limit) {
        truncated = true;
        break;
      }

      const remaining = limits.maxTotalBytes - budget.used;
      const declared = declaredSize(entry);
      if (declared !== null && declared > limits.maxEntryBytes) {
        skipped += 1;
        truncated = true;
        continue;
      }
      if (declared !== null && declared > remaining) {
        truncated = true;
        break;
      }

      let bytes: Uint8Array | null;
      try {
        bytes = await inflateBounded(entry, Math.min(limits.maxEntryBytes, remaining), budget);
      } catch {
        skipped += 1;
        continue;
      }
      if (bytes === null) {
        truncated = true;
        if (budget.used >= budget.limit) {
          truncated = true;
          break;
        }
        skipped += 1;
        continue;
      }

      try {
        const note = noteFromJson(
          path.split("/").pop() ?? path,
          new TextDecoder().decode(bytes),
        );
        if (note) notes.push(note);
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    return { notes, skipped, truncated };
  }

  if (lowerName.endsWith(".json")) {
    if (data.byteLength > Math.min(limits.maxEntryBytes, limits.maxTotalBytes)) {
      return { notes: [], skipped: 1, truncated: true };
    }
    let note: KeepImportNote | null;
    try {
      note = noteFromJson(fileName, new TextDecoder().decode(data));
    } catch {
      throw new InvalidKeepExport();
    }
    return { notes: note ? [note] : [], skipped: note ? 0 : 1, truncated: false };
  }

  return { notes: [], skipped: 1, truncated: false };
}
