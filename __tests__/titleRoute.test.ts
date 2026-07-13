import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

import { POST } from "@/app/api/notes/title/route";

beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: `owner-${crypto.randomUUID()}` } });
});

describe("/api/notes/title", () => {
  it("requires authentication before accepting note text", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(new Request("https://keeptxt.com/api/notes/title", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "private text" }),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects oversized note bodies before title generation", async () => {
    const res = await POST(
      new Request("https://keeptxt.com/api/notes/title", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.20",
        },
        body: JSON.stringify({ body: "a".repeat(8 * 1024 + 1) }),
      }),
    );

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toEqual({
      error: "Note body is too large for title generation.",
    });
  });

  it("rate limits repeated calls from the same IP", async () => {
    const ip = "203.0.113.21";
    let res = new Response(null, { status: 500 });

    for (let i = 0; i < 13; i++) {
      res = await POST(
        new Request("https://keeptxt.com/api/notes/title", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({ body: `note ${i}` }),
        }),
      );
    }

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("rejects a chunked oversized body without relying on Content-Length", async () => {
    const body = JSON.stringify({ body: "a".repeat(20 * 1024) });
    const res = await POST(new Request("https://keeptxt.com/api/notes/title", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 100) + 100}`,
      },
      body,
    }));
    expect(res.status).toBe(413);
  });
});
