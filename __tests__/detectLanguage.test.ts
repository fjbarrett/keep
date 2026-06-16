import { describe, it, expect } from "vitest";
import { noteFileExtension } from "@/lib/detectLanguage";

describe("noteFileExtension", () => {
  it("falls back to txt for plain prose", () => {
    expect(noteFileExtension("Just some plain notes to myself.")).toBe("txt");
  });

  it("returns md for markdown", () => {
    expect(noteFileExtension("# Heading\n\nSome **bold** text.")).toBe("md");
  });

  it("maps detected code languages to their extension", () => {
    expect(noteFileExtension("def main():\n    pass")).toBe("py");
    expect(noteFileExtension('{\n  "a": 1\n}')).toBe("json");
    expect(noteFileExtension("import { x } from 'y'")).toBe("ts");
    expect(noteFileExtension("npm install left-pad")).toBe("sh");
  });
});
