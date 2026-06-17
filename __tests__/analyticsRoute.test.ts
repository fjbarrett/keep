import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/analytics/route";

function beacon(ip: string, body: unknown) {
  return POST(
    new Request("https://keeptxt.com/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

describe("/api/analytics", () => {
  it("ignores a malformed beacon with 204 (before any DB work)", async () => {
    const res = await beacon("203.0.113.80", { type: "pageview" }); // no path
    expect(res.status).toBe(204);
  });

  it("rate limits floods from one IP", async () => {
    const ip = "203.0.113.81";
    let res = new Response(null, { status: 500 });
    // 61 malformed beacons: each consumes a token before the DB path, so the
    // last trips the 60/min limit without needing a database.
    for (let i = 0; i < 61; i++) res = await beacon(ip, { foo: i });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
