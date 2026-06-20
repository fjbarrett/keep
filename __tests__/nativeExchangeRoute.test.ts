import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/native/exchange/route";

// A missing/invalid code is rejected before any DB call, so these exercise the
// input guard without a database (matching the other route tests here).
function exchange(body: string) {
  return POST(
    new Request("https://keeptxt.com/api/native/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
}

describe("/api/native/exchange", () => {
  it("rejects a request with no code", async () => {
    const res = await exchange(JSON.stringify({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing code." });
  });

  it("rejects a non-string code", async () => {
    const res = await exchange(JSON.stringify({ code: 123 }));
    expect(res.status).toBe(400);
  });

  it("rejects an unparseable body", async () => {
    const res = await exchange("not json");
    expect(res.status).toBe(400);
  });
});
