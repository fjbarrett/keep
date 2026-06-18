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

  it("blocks guessing against one account even from rotating IPs", () => {
    const check = createLoginThrottle({
      ipLimit: 100,
      ipWindowMs: 1000,
      accountLimit: 2,
      accountWindowMs: 1000,
    });

    expect(check("1.1.1.1", "victim@x.com", 0).allowed).toBe(true);
    expect(check("2.2.2.2", "victim@x.com", 0).allowed).toBe(true);
    expect(check("3.3.3.3", "victim@x.com", 0)).toMatchObject({
      allowed: false,
      scope: "account",
    });
  });

  it("does not spend an account token when the IP is already blocked", () => {
    const check = createLoginThrottle({
      ipLimit: 1,
      ipWindowMs: 1000,
      accountLimit: 5,
      accountWindowMs: 1000,
    });

    expect(check("9.9.9.9", "victim@x.com", 0).allowed).toBe(true); // ip+acct spent once
    expect(check("9.9.9.9", "victim@x.com", 0)).toMatchObject({ allowed: false, scope: "ip" });

    // The account still has its remaining 4 tokens for other source IPs.
    for (let i = 0; i < 4; i++) {
      expect(check(`1.1.1.${i}`, "victim@x.com", 0).allowed).toBe(true);
    }
    expect(check("2.2.2.2", "victim@x.com", 0)).toMatchObject({
      allowed: false,
      scope: "account",
    });
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

  it("checks only the IP budget for accountless (passkey) attempts", () => {
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
