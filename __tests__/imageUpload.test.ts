import { describe, expect, it } from "vitest";
import { hasValidImageSignature, imageExtension } from "@/lib/imageUpload";

describe("image upload validation", () => {
  it("recognizes allowed raster signatures", () => {
    expect(hasValidImageSignature(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    )).toBe(true);
    expect(hasValidImageSignature(
      new TextEncoder().encode("GIF89a"),
      "image/gif",
    )).toBe(true);
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });

  it("rejects HTML mislabeled as an image", () => {
    expect(hasValidImageSignature(
      new TextEncoder().encode("<script>alert(1)</script>"),
      "image/png",
    )).toBe(false);
  });
});
