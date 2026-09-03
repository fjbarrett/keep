import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: (handler: (request: NextRequest) => unknown) => handler,
  }),
}));

const { default: handleRequest } = await import("@/proxy");

function mutation(origin?: string, forwardedHost?: string) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  if (forwardedHost) {
    headers.set("x-forwarded-host", forwardedHost);
    headers.set("x-forwarded-proto", "https");
  }
  return new NextRequest("http://internal:3000/api/analytics", {
    method: "POST",
    headers,
  });
}

afterEach(() => {
  delete process.env.AUTH_URL;
  delete process.env.APP_URL;
});

describe("proxy mutation origin policy", () => {
  it("rejects an evil Origin even when X-Forwarded-Host is spoofed to match", async () => {
    process.env.AUTH_URL = "https://keeptxt.com";
    const response = await handleRequest(
      mutation("https://evil.example", "evil.example") as never,
      {} as never,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
  });

  it("allows an Origin from configured canonical URLs", async () => {
    process.env.APP_URL = "https://app.keeptxt.com";

    expect(
      await handleRequest(mutation("https://app.keeptxt.com") as never, {} as never),
    ).toBeUndefined();
  });

  it("allows native requests without an Origin", async () => {
    expect(await handleRequest(mutation() as never, {} as never)).toBeUndefined();
  });

  it("fails closed when the only configured URL is malformed", async () => {
    process.env.APP_URL = "not a url";
    const response = await handleRequest(
      mutation("https://keeptxt.com") as never,
      {} as never,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
  });
});
