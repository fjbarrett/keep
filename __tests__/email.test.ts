import { afterEach, describe, expect, it, vi } from "vitest";
import { sendVerificationEmail } from "@/lib/email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verification email delivery", () => {
  it("fails registration visibly when production delivery is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(
      sendVerificationEmail("person@example.com", "https://keeptxt.com/verify"),
    ).rejects.toThrow("not configured");
  });
});
