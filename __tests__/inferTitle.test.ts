import { describe, it, expect } from "vitest";
import {
  inferNoteTitle,
  needsInferredTitle,
  previewText,
  searchableText,
} from "@/lib/inferTitle";

describe("inferNoteTitle", () => {
  it("returns the first non-empty line", () => {
    expect(inferNoteTitle("Hello world\nmore text")).toBe("Hello world");
  });

  it("strips bullet prefixes", () => {
    expect(inferNoteTitle("- Buy milk")).toBe("Buy milk");
    expect(inferNoteTitle("* Task item")).toBe("Task item");
  });

  it("strips checkbox prefixes", () => {
    expect(inferNoteTitle("- [x] Done task")).toBe("Done task");
    expect(inferNoteTitle("- [ ] Open task")).toBe("Open task");
  });

  it("skips URL-only lines", () => {
    expect(inferNoteTitle("https://example.com\nActual title")).toBe(
      "Actual title",
    );
  });

  it("caps at 7 words", () => {
    const long = "one two three four five six seven eight nine";
    expect(inferNoteTitle(long)).toBe("one two three four five six seven");
  });

  it("caps at 64 characters with ellipsis", () => {
    const long = "a".repeat(80);
    const result = inferNoteTitle(long);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns fallback for empty body", () => {
    expect(inferNoteTitle("")).toBe("Untitled note");
    expect(inferNoteTitle("   ")).toBe("Untitled note");
  });

  it("accepts custom fallback", () => {
    expect(inferNoteTitle("", "Empty")).toBe("Empty");
  });

  it("skips blank lines to find title", () => {
    expect(inferNoteTitle("\n\n  \nReal title\n")).toBe("Real title");
  });
});

describe("needsInferredTitle", () => {
  it("returns true for empty title", () => {
    expect(needsInferredTitle("", "body")).toBe(true);
  });

  it("returns true when title equals body", () => {
    expect(needsInferredTitle("same text", "same text")).toBe(true);
  });

  it("returns true for very long titles", () => {
    const long = "a".repeat(65);
    expect(needsInferredTitle(long, "body")).toBe(true);
  });

  it("returns true for titles with too many words", () => {
    const manyWords = "one two three four five six seven eight";
    expect(needsInferredTitle(manyWords, "body")).toBe(true);
  });

  it("returns false for a normal title", () => {
    expect(needsInferredTitle("My Note", "some body text")).toBe(false);
  });
});

describe("searchableText", () => {
  it("uses body when present", () => {
    expect(searchableText({ body: "body", title: "title" })).toBe("body");
  });

  it("falls back to title when body is empty", () => {
    expect(searchableText({ body: "", title: "title" })).toBe("title");
  });
});

describe("previewText", () => {
  it("infers title for notes without explicit title", () => {
    const result = previewText({ body: "Hello world", title: "" });
    expect(result).toBe("Hello world");
  });

  it("uses saved title when valid", () => {
    const result = previewText({ body: "long body text here", title: "My Note" });
    expect(result).toBe("My Note");
  });

  it("returns fallback for blank note", () => {
    expect(previewText({ body: "", title: "" })).toBe("Untitled note");
  });
});
