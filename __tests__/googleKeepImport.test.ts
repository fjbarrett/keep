import { describe, it, expect } from "vitest";
import { parseGoogleKeepImport } from "@/lib/googleKeepImport";

function jsonToBuffer(data: Record<string, unknown>): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(data)).buffer;
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
  });
});
