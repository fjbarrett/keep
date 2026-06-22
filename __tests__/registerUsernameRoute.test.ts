import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/register/username/route";

function register(ip: string) {
  // An invalid username fails validation before any DB call, so this exercises
  // the rate-limit guard without needing a database.
  return POST(
    new Request("https://keeptxt.com/api/auth/register/username", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ username: "bad name!", password: "x" }),
    }),
  );
}

describe("/api/auth/register/username", () => {
  it("rate limits repeated attempts from the same IP", async () => {
    const ip = "203.0.113.41";
    let res = new Response(null, { status: 500 });

    for (let i = 0; i < 7; i++) {
      res = await register(ip);
    }

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
