import { describe, it, expect } from "vitest";
import { isNoteColor } from "@/lib/noteColors";
import { tagsInvalid, MAX_TAGS, MAX_TAG_LEN } from "@/lib/noteLimits";

describe("isNoteColor", () => {
  it("accepts palette keys and rejects anything else", () => {
    expect(isNoteColor("blue")).toBe(true);
    expect(isNoteColor("purple")).toBe(true);
    expect(isNoteColor("chartreuse")).toBe(false);
    expect(isNoteColor(null)).toBe(false);
    expect(isNoteColor(42)).toBe(false);
  });
});

describe("tagsInvalid", () => {
  it("accepts a normal tag array", () => {
    expect(tagsInvalid(["work", "ideas"])).toBe(false);
    expect(tagsInvalid([])).toBe(false);
  });

  it("rejects non-arrays, non-string entries, and oversized tags", () => {
    expect(tagsInvalid("nope")).toBe(true);
    expect(tagsInvalid([123])).toBe(true);
    expect(tagsInvalid(["x".repeat(MAX_TAG_LEN + 1)])).toBe(true);
    expect(tagsInvalid(Array.from({ length: MAX_TAGS + 1 }, () => "t"))).toBe(true);
  });
});
