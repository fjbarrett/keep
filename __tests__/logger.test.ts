import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEvent, logger, maskEmail, maskIp } from "@/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("buildEvent redaction", () => {
  it("redacts secret-looking keys, at any depth, in arrays too", () => {
    const e = buildEvent("info", "m", {}, {
      password: "hunter2",
      passwordHash: "scrypt$abc",
      shareToken: "ABC123",
      authorization: "Bearer xyz",
      apiKey: "sk-live-123",
      DATABASE_URL: "postgres://u:p@h/db",
      nested: { verify_token: "tok", ok: 1 },
      list: [{ cookie: "sid=1" }],
    });
    expect(e.password).toBe("[redacted]");
    expect(e.passwordHash).toBe("[redacted]");
    expect(e.shareToken).toBe("[redacted]");
    expect(e.authorization).toBe("[redacted]");
    expect(e.apiKey).toBe("[redacted]");
    expect(e.DATABASE_URL).toBe("[redacted]");
    expect(e.nested).toEqual({ verify_token: "[redacted]", ok: 1 });
    expect(e.list).toEqual([{ cookie: "[redacted]" }]);
  });

  it("leaves innocuous keys alone (no false positives on author/hashtag)", () => {
    const e = buildEvent("info", "m", {}, { author: "frank", hashtag: "#keep", noteId: "abcd" });
    expect(e.author).toBe("frank");
    expect(e.hashtag).toBe("#keep");
    expect(e.noteId).toBe("abcd");
  });

  it("serializes an Error into name/message/stack", () => {
    const e = buildEvent("error", "boom", {}, { err: new TypeError("nope") });
    expect(e.err).toMatchObject({ name: "TypeError", message: "nope" });
    expect(typeof (e.err as { stack: string }).stack).toBe("string");
  });

  it("stamps level, msg, ts and merges child bindings", () => {
    const e = buildEvent("warn", "hi", { route: "auth:register" }, { ip: "x" });
    expect(e).toMatchObject({ level: "warn", msg: "hi", route: "auth:register", ip: "x" });
    expect(typeof e.ts).toBe("string");
  });
});

describe("logger output", () => {
  it("writes one redacted JSON line to stdout and never leaks the secret", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.info("login", { userId: "u1", password: "hunter2" });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line.endsWith("\n")).toBe(true);
    expect(line).not.toContain("hunter2");
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ level: "info", msg: "login", userId: "u1", password: "[redacted]" });
  });

  it("routes warn/error to stderr", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    logger.error("bad", {});
    expect(err).toHaveBeenCalledTimes(1);
    expect(out).not.toHaveBeenCalled();
  });

  it("drops events below LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.info("ignored", {});
    logger.debug("ignored", {});
    expect(out).not.toHaveBeenCalled();
  });
});

describe("PII masks", () => {
  it("masks an email's local part", () => {
    const masked = maskEmail("frank.barrett@example.com");
    expect(masked).toBe("f" + "*".repeat("frank.barrett".length - 1) + "@example.com");
    expect(masked).not.toContain("rank.barrett");
    expect(maskEmail("a@b.co")).toBe("a@b.co");
    expect(maskEmail("not-an-email")).toBe("[redacted]");
  });

  it("masks the host portion of an IP", () => {
    expect(maskIp("203.0.113.42")).toBe("203.0.x.x");
    expect(maskIp("2001:db8:1:2:3:4:5:6")).toBe("2001:db8::");
    expect(maskIp("garbage")).toBe("[redacted]");
  });
});
