import { describe, it, expect } from "vitest";
import { passwordIssue, hashPassword, verifyPassword } from "@/lib/password";

describe("passwordIssue", () => {
  it("rejects short passwords", () => {
    expect(passwordIssue("short")).toBe("Use at least 10 characters.");
  });

  it("rejects digit-only passwords", () => {
    expect(passwordIssue("1234567890")).toBe("Use more than just digits.");
  });

  it("rejects passwords over the length cap", () => {
    expect(passwordIssue("a".repeat(1025))).toBe("Password is too long.");
  });

  it("accepts a reasonable passphrase", () => {
    expect(passwordIssue("correct horse battery staple")).toBeNull();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("wrong password entirely", stored)).toBe(false);
  });
});
