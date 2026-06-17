import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/register/route";

function register(ip: string) {
  // An invalid email fails validation before any DB call, so this exercises the
  // rate-limit guard without needing a database.
  return POST(
    new Request("https://keeptxt.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "not-an-email", password: "x" }),
    }),
  );
}

describe("/api/auth/register", () => {
  it("rate limits repeated attempts from the same IP", async () => {
    const ip = "203.0.113.40";
    let res = new Response(null, { status: 500 });

    for (let i = 0; i < 7; i++) {
      res = await register(ip);
    }

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
