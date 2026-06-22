import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameIssue, USERNAME_MAX, USERNAME_MIN } from "@/lib/username";

describe("normalizeUsername", () => {
  it("lowercases and trims so capitalization never distinguishes accounts", () => {
    expect(normalizeUsername("QuietFerret")).toBe("quietferret");
    expect(normalizeUsername("  M3ridian  ")).toBe("m3ridian");
    expect(normalizeUsername("QUIETFERRET")).toBe("quietferret");
  });
});

describe("usernameIssue", () => {
  it("accepts letters and numbers in any capitalization", () => {
    expect(usernameIssue("QuietFox")).toBeNull();
    expect(usernameIssue("m3ridian")).toBeNull();
    expect(usernameIssue("ABC123")).toBeNull();
  });

  it("rejects punctuation, symbols, and whitespace", () => {
    for (const bad of ["quiet_fox", "quiet-fox", "quiet.fox", "quiet fox", "anon!", "a@b"]) {
      expect(usernameIssue(bad)).toBe("Use letters and numbers only.");
    }
  });

  it(`rejects usernames longer than ${USERNAME_MAX} characters`, () => {
    expect(usernameIssue("a".repeat(USERNAME_MAX))).toBeNull();
    expect(usernameIssue("a".repeat(USERNAME_MAX + 1))).toBe(`Use at most ${USERNAME_MAX} characters.`);
  });

  it(`rejects usernames shorter than ${USERNAME_MIN} characters`, () => {
    expect(usernameIssue("ab")).toBe(`Use at least ${USERNAME_MIN} characters.`);
    expect(usernameIssue("abc")).toBeNull();
  });

  it("rejects an empty or whitespace-only username", () => {
    expect(usernameIssue("")).toBe("Choose a username.");
    expect(usernameIssue("   ")).toBe("Choose a username.");
  });
});
