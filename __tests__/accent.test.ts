import { describe, it, expect } from "vitest";
import { ACCENTS, accentFor, accentBootstrapScript } from "@/lib/accent";

describe("accent palette", () => {
  it("leads with multicolor and includes the macOS-style solids", () => {
    expect(ACCENTS[0].key).toBe("multicolor");
    const keys = ACCENTS.map((a) => a.key);
    for (const k of ["blue", "purple", "pink", "red", "orange", "yellow", "green", "graphite"]) {
      expect(keys).toContain(k);
    }
  });

  it("falls back to multicolor for unknown keys", () => {
    expect(accentFor("green").key).toBe("green");
    expect(accentFor("chartreuse").key).toBe("multicolor");
    expect(accentFor(null).key).toBe("multicolor");
  });
});

describe("accentBootstrapScript", () => {
  it("references the storage key and solid accents, but excludes multicolor from the value map", () => {
    const script = accentBootstrapScript();
    expect(script).toContain("keep.accent");
    expect(script).toContain("green");
    // multicolor is only the early-return guard, never a key in the color map.
    expect(script).not.toContain('"multicolor":');
  });
});
