import { describe, expect, it } from "vitest";
import { newShareToken } from "@/lib/shareToken";
import { newId } from "@/lib/db";

describe("opaque identifiers", () => {
  it("uses 128-bit internal ids", () => {
    expect(newId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("uses 128-bit URL-safe share credentials", () => {
    const tokens = Array.from({ length: 100 }, () => newShareToken());
    expect(new Set(tokens)).toHaveLength(tokens.length);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
