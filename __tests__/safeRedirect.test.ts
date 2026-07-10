import { describe, it, expect } from "vitest";
import { safeRedirect } from "@/lib/safeRedirect";

describe("safeRedirect", () => {
  it("allows same-origin relative paths", () => {
    expect(safeRedirect("/note/abc")).toBe("/note/abc");
    expect(safeRedirect("/")).toBe("/");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirect("https://evil.com")).toBe("/");
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("http://evil.com/x")).toBe("/");
    expect(safeRedirect("/\\evil.com")).toBe("/");
    expect(safeRedirect("/\\/evil.com")).toBe("/");
    expect(safeRedirect("/%5cevil.com")).toBe("/");
  });

  it("rejects dot-segment inputs that normalize to protocol-relative", () => {
    expect(safeRedirect("/..//evil.com")).toBe("/");
    expect(safeRedirect("/%2e%2e//evil.com")).toBe("/");
    expect(safeRedirect("/x/..//..//evil.com")).toBe("/");
    expect(safeRedirect("/x/..//evil.com")).toBe("/");
  });

  it("falls back to / for empty/undefined", () => {
    expect(safeRedirect(undefined)).toBe("/");
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect("")).toBe("/");
    expect(safeRedirect("note/abc")).toBe("/");
    expect(safeRedirect(["/note/abc"])).toBe("/");
  });
});
