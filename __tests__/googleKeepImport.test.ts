import { afterEach, describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import { InvalidKeepExport, parseGoogleKeepImport } from "@/lib/googleKeepImport";

afterEach(() => vi.restoreAllMocks());

function jsonToBuffer(data: Record<string, unknown>): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(data)).buffer;
}

async function buildKeepZip(
  entries: Record<string, unknown>[],
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  entries.forEach((data, i) =>
    zip.file(`Takeout/Keep/note-${i}.json`, JSON.stringify(data)),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("parseGoogleKeepImport", () => {
  it("parses a single JSON note with text content", async () => {
    const result = await parseGoogleKeepImport(
      "note.json",
      jsonToBuffer({
        title: "My Note",
        textContent: "Hello world",
        isPinned: true,
        createdTimestampUsec: "1700000000000000",
        userEditedTimestampUsec: "1700001000000000",
      }),
    );

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].body).toBe("My Note\n\nHello world");
    expect(result.notes[0].pinned).toBe(true);
    expect(result.notes[0].archived).toBe(false);
    expect(result.skipped).toBe(0);
  });

  it("parses checklist content", async () => {
    const result = await parseGoogleKeepImport(
      "list.json",
      jsonToBuffer({
        title: "Shopping",
        listContent: [
          { text: "Milk", isChecked: false },
          { text: "Eggs", isChecked: true },
        ],
        createdTimestampUsec: "1700000000000000",
      }),
    );

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].body).toContain("- [ ] Milk");
    expect(result.notes[0].body).toContain("- [x] Eggs");
  });

  it("skips empty notes", async () => {
    const result = await parseGoogleKeepImport(
      "empty.json",
      jsonToBuffer({ title: "", textContent: "" }),
    );

    expect(result.notes).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("unpins archived notes", async () => {
    const result = await parseGoogleKeepImport(
      "archived.json",
      jsonToBuffer({
        title: "Old note",
        textContent: "content",
        isPinned: true,
        isArchived: true,
        createdTimestampUsec: "1700000000000000",
      }),
    );

    expect(result.notes[0].pinned).toBe(false);
    expect(result.notes[0].archived).toBe(true);
  });

  it("rejects unsupported file types", async () => {
    const result = await parseGoogleKeepImport(
      "notes.txt",
      new TextEncoder().encode("plain text").buffer,
    );

    expect(result.notes).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("handles missing timestamps gracefully", async () => {
    const result = await parseGoogleKeepImport(
      "no-dates.json",
      jsonToBuffer({ title: "Note", textContent: "body" }),
    );

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].createdAt).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });
});

describe("parseGoogleKeepImport bounds", () => {
  const big = 1024 * 1024;

  it("stops collecting streamed bytes at the cap without trusting metadata", async () => {
    const pause = vi.fn();
    const handlers: Record<string, (chunk?: Uint8Array) => void> = {};
    const stream = {
      on(event: string, handler: (chunk?: Uint8Array) => void) { handlers[event] = handler; return stream; },
      pause,
      resume() {
        handlers.data(new Uint8Array(8));
        handlers.data(new Uint8Array(8));
        return stream;
      },
    };
    vi.spyOn(JSZip, "loadAsync").mockResolvedValue({ files: {
      "Keep/note.json": { dir: false, internalStream: () => stream },
    } } as unknown as JSZip);
    const result = await parseGoogleKeepImport("notes.zip", new ArrayBuffer(0), {
      maxNotes: 2, maxEntryBytes: 12, maxTotalBytes: 100,
    });
    expect(pause).toHaveBeenCalledOnce();
    expect(result).toEqual({ notes: [], skipped: 1, truncated: true });
  });

  it("bounds standalone JSON by UTF-8 bytes", async () => {
    const result = await parseGoogleKeepImport("note.json", jsonToBuffer({ textContent: "é".repeat(20) }), {
      maxNotes: 2, maxEntryBytes: 50, maxTotalBytes: 100,
    });
    expect(result).toEqual({ notes: [], skipped: 1, truncated: true });
  });

  it("returns a useful validation error for malformed JSON", async () => {
    await expect(parseGoogleKeepImport("note.json", new TextEncoder().encode("{").buffer))
      .rejects.toBeInstanceOf(InvalidKeepExport);
  });

  it("counts invalid entries toward the work limit", async () => {
    const data = await buildKeepZip([{ textContent: "" }, { textContent: "later" }]);
    const result = await parseGoogleKeepImport("notes.zip", data, {
      maxNotes: 1, maxEntryBytes: 1000, maxTotalBytes: 1000,
    });
    expect(result).toEqual({ notes: [], skipped: 1, truncated: true });
  });

  it("caps the number of imported notes and flags truncation", async () => {
    const data = await buildKeepZip([
      { textContent: "one" },
      { textContent: "two" },
      { textContent: "three" },
    ]);

    const result = await parseGoogleKeepImport("Takeout.zip", data, {
      maxNotes: 2,
      maxEntryBytes: big,
      maxTotalBytes: 50 * big,
    });

    expect(result.notes).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("skips an entry larger than the per-entry cap", async () => {
    const data = await buildKeepZip([
      { textContent: "small" },
      { textContent: "x".repeat(5000) },
    ]);

    const result = await parseGoogleKeepImport("Takeout.zip", data, {
      maxNotes: 100,
      maxEntryBytes: 1000,
      maxTotalBytes: 50 * big,
    });

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].body).toBe("small");
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("stops once the total decompressed cap is reached", async () => {
    const chunk = "y".repeat(2000);
    const data = await buildKeepZip([
      { textContent: chunk },
      { textContent: chunk },
      { textContent: chunk },
    ]);

    const result = await parseGoogleKeepImport("Takeout.zip", data, {
      maxNotes: 100,
      maxEntryBytes: big,
      maxTotalBytes: 3000,
    });

    expect(result.notes.length).toBeLessThan(3);
    expect(result.truncated).toBe(true);
  });
});
