import { describe, expect, it } from "vitest";
import { createLoginThrottle } from "@/lib/loginThrottle";

describe("createLoginThrottle", () => {
  it("blocks a single IP once its budget is spent", () => {
    const check = createLoginThrottle({
      ipLimit: 2,
      ipWindowMs: 1000,
      accountLimit: 100,
      accountWindowMs: 1000,
    });

    expect(check("1.1.1.1", "a@x.com", 0).allowed).toBe(true);
    expect(check("1.1.1.1", "a@x.com", 0).allowed).toBe(true);
    expect(check("1.1.1.1", "a@x.com", 0)).toMatchObject({ allowed: false, scope: "ip" });
  });

  it("limits repeated guesses without blocking sign-in from another network", () => {
    const check = createLoginThrottle({ ipLimit: 100, accountLimit: 2, accountWindowMs: 1000 });
    expect(check("1.1.1.1", "owner@example.com", 0).allowed).toBe(true);
    expect(check("1.1.1.1", "owner@example.com", 0).allowed).toBe(true);
    expect(check("1.1.1.1", "owner@example.com", 0)).toEqual({ allowed: false, scope: "account" });
    expect(check("2.2.2.2", "owner@example.com", 0).allowed).toBe(true);
    expect(check("1.1.1.1", "owner@example.com", 1000).allowed).toBe(true);
  });

  it("tracks accounts independently", () => {
    const check = createLoginThrottle({
      ipLimit: 100,
      ipWindowMs: 1000,
      accountLimit: 1,
      accountWindowMs: 1000,
    });

    expect(check("1.1.1.1", "a@x.com", 0).allowed).toBe(true);
    expect(check("1.1.1.1", "a@x.com", 0).allowed).toBe(false);
    expect(check("1.1.1.1", "b@x.com", 0).allowed).toBe(true);
  });

  it("checks only the IP budget for accountless attempts", () => {
    const check = createLoginThrottle({
      ipLimit: 2,
      ipWindowMs: 1000,
      accountLimit: 1,
      accountWindowMs: 1000,
    });

    expect(check("1.1.1.1", null, 0).allowed).toBe(true);
    expect(check("1.1.1.1", null, 0).allowed).toBe(true);
    expect(check("1.1.1.1", null, 0)).toMatchObject({ allowed: false, scope: "ip" });
  });
});
