import { describe, it, expect } from "vitest";
import {
  inferNoteTitle,
  needsInferredTitle,
  previewText,
  searchableText,
  stripEmDashes,
} from "@/lib/inferTitle";

describe("inferNoteTitle", () => {
  it("returns the first non-empty line", () => {
    expect(inferNoteTitle("Hello world\nmore text")).toBe("Hello world");
  });

  it("never keeps em dashes in the title", () => {
    expect(inferNoteTitle("Roadmap — Q3 plan")).toBe("Roadmap - Q3 plan");
    expect(inferNoteTitle("Budget—2026")).toBe("Budget - 2026");
  });

  it("strips bullet prefixes", () => {
    expect(inferNoteTitle("- Buy milk")).toBe("Buy milk");
    expect(inferNoteTitle("* Task item")).toBe("Task item");
  });

  it("strips checkbox prefixes", () => {
    expect(inferNoteTitle("- [x] Done task")).toBe("Done task");
    expect(inferNoteTitle("- [ ] Open task")).toBe("Open task");
  });

  it("strips markdown heading markers", () => {
    expect(inferNoteTitle("# My Title")).toBe("My Title");
    expect(inferNoteTitle("## Section Two")).toBe("Section Two");
  });

  it("strips inline markdown formatting", () => {
    expect(inferNoteTitle("**Bold title** here")).toBe("Bold title here");
    expect(inferNoteTitle("_italic_ note")).toBe("italic note");
    expect(inferNoteTitle("`code` block")).toBe("code block");
  });

  it("skips URL-only lines", () => {
    expect(inferNoteTitle("https://example.com\nActual title")).toBe(
      "Actual title",
    );
  });

  it("skips code fence lines", () => {
    expect(inferNoteTitle("```\nsome code\nend")).toBe("some code");
  });

  it("skips image-only lines", () => {
    expect(inferNoteTitle("![alt](image.png)\nReal title")).toBe("Real title");
  });

  it("caps at 4 words", () => {
    const long = "one two three four five six";
    expect(inferNoteTitle(long)).toBe("one two three four");
  });

  it("caps at 36 characters with ellipsis", () => {
    const long = "a".repeat(50);
    const result = inferNoteTitle(long);
    expect(result.length).toBeLessThanOrEqual(36);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns fallback for empty body", () => {
    expect(inferNoteTitle("")).toBe("Untitled text");
    expect(inferNoteTitle("   ")).toBe("Untitled text");
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
    const long = "a".repeat(37);
    expect(needsInferredTitle(long, "body")).toBe(true);
  });

  it("returns true for titles with too many words", () => {
    const manyWords = "one two three four five six seven";
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
    expect(previewText({ body: "", title: "" })).toBe("Untitled text");
  });
});

describe("stripEmDashes", () => {
  it("replaces em and en dashes with a spaced hyphen", () => {
    expect(stripEmDashes("a — b")).toBe("a - b");
    expect(stripEmDashes("a–b")).toBe("a - b");
  });

  it("leaves plain text untouched", () => {
    expect(stripEmDashes("nothing fancy here")).toBe("nothing fancy here");
  });
});
