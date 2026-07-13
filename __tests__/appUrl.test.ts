import { afterEach, describe, expect, it } from "vitest";
import { appOrigin, isSameOriginMutation } from "@/lib/appUrl";

afterEach(() => {
  delete process.env.AUTH_URL;
});

describe("canonical application origin", () => {
  it("uses configured AUTH_URL instead of a request-controlled host", () => {
    process.env.AUTH_URL = "https://keeptxt.com/some/path";
    expect(appOrigin(new Request("https://attacker.invalid/register")))
      .toBe("https://keeptxt.com");
  });

  it("rejects same-site requests from another origin", () => {
    process.env.AUTH_URL = "https://keeptxt.com";
    const request = new Request("https://keeptxt.com/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://untrusted.keeptxt.com",
        "sec-fetch-site": "same-site",
      },
    });
    expect(isSameOriginMutation(request)).toBe(false);
  });
});
