import { describe, it, expect } from "vitest";
import { ACCENTS, accentFor, accentBootstrapScript } from "@/lib/accent";
import { noteColorForeground, noteColorVar } from "@/lib/noteColors";

function luminance(hex: string) {
  const linear = hex.slice(1).match(/.{2}/g)!.map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("accent palette", () => {
  it.each(ACCENTS)("keeps $key text readable on both solid and hover fills", (accent) => {
    expect(contrast(accent.fg, accent.color)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent.fg, accent.hover)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACCENTS.filter((a) => a.key !== "multicolor"))(
    "matches the selected $key note foreground to its own background",
    (accent) => {
      expect(contrast(noteColorForeground(accent.key)!, noteColorVar(accent.key)!)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("leaves unlabeled and unknown notes on the app accent", () => {
    for (const key of [null, undefined, "unknown", "multicolor"]) {
      expect(noteColorForeground(key)).toBeNull();
    }
  });

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
