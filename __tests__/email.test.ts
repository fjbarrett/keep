import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendVerificationEmail } from "@/lib/email";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
  fetchMock.mockReset().mockResolvedValue(Response.json({ id: "test-email" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verification email delivery", () => {
  it("fails registration visibly when production delivery is not configured", async () => {
    await expect(
      sendVerificationEmail("person@example.com", "https://keeptxt.com/verify"),
    ).rejects.toThrow("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["RESEND_API_KEY", "RESEND_KEY"])("sends verification with %s", async (name) => {
    vi.stubEnv(name, " test-only-key ");
    await sendVerificationEmail("person@example.com", "https://keeptxt.com/api/auth/verify?token=test");
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-only-key" }),
    }));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.from).toBe("Keep <verify@keeptxt.com>");
    expect(payload.to).toBe("person@example.com");
    expect(payload.html).toContain("https://keeptxt.com/api/auth/verify?token=test");
  });

  it("prefers the canonical key and honors an explicitly configured sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "canonical-test-key");
    vi.stubEnv("RESEND_KEY", "legacy-test-key");
    vi.stubEnv("EMAIL_FROM", " Keep <mail@verified.example> ");
    await sendVerificationEmail("person@example.com", "https://keeptxt.com/verify");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer canonical-test-key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).from).toBe("Keep <mail@verified.example>");
  });

  it("falls back to the legacy key when the canonical value is whitespace", async () => {
    vi.stubEnv("RESEND_API_KEY", "  ");
    vi.stubEnv("RESEND_KEY", "legacy-test-key");
    await sendVerificationEmail("person@example.com", "https://keeptxt.com/verify");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer legacy-test-key");
  });

  it("still reports provider rejection without exposing its response payload", async () => {
    vi.stubEnv("RESEND_KEY", "test-only-key");
    fetchMock.mockResolvedValueOnce(Response.json({ message: "private-provider-details" }, { status: 403 }));
    await expect(sendVerificationEmail("person@example.com", "https://keeptxt.com/verify"))
      .rejects.toThrow(/^Email send failed \(403\)$/);
  });
});
