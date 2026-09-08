// Transactional email via Resend. RESEND_KEY is the legacy deployment name;
// prefer RESEND_API_KEY when both exist. Only development may log links.

import { logger, maskEmail } from "@/lib/logger";

const log = logger.child({ module: "email" });

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim() || process.env.RESEND_KEY?.trim();
  // Resend's shared testing domain cannot deliver to arbitrary signup emails.
  // Production uses Keep's domain, which must be verified in Resend.
  const from = process.env.EMAIL_FROM?.trim() || (
    process.env.NODE_ENV === "production"
      ? "Keep <verify@keeptxt.com>"
      : "Keep <onboarding@resend.dev>"
  );

  if (!key) {
    // The verify URL carries a single-use account token, so only surface it in
    // development; in production just record the misconfiguration.
    if (process.env.NODE_ENV !== "production") {
      log.warn("no Resend API key — verification link (dev only)", {
        to: maskEmail(to),
        verifyUrl,
      });
    } else {
      log.error("RESEND_API_KEY and RESEND_KEY unset — cannot send verification email", {
        to: maskEmail(to),
      });
      throw new Error("Email delivery is not configured");
    }
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Verify your Keep account",
      html: `<p>Welcome to Keep.</p><p>Confirm your email to finish setting up your account:</p><p><a href="${verifyUrl}">Verify my email</a></p><p>If you didn't sign up, you can ignore this.</p>`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Email send failed (${res.status})`);
  }
}
