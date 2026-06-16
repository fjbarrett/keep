import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/notes/title/route";

describe("/api/notes/title", () => {
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
});
