import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/resend/route";

describe("/api/auth/resend", () => {
  it("returns the same generic response for an invalid address", async () => {
    const response = await POST(
      new Request("https://keeptxt.com/api/auth/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.81",
        },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
