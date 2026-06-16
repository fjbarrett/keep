import { describe, it, expect, vi } from "vitest";
import { internalError, isUniqueViolation } from "@/lib/apiError";

describe("isUniqueViolation", () => {
  it("detects a Postgres unique violation (23505) and nothing else", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("internalError", () => {
  it("returns a generic 500 and never echoes the underlying message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = internalError("test", new Error("DATABASE_URL hint: postgres://secret"));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Internal error" });
    spy.mockRestore();
  });
});
