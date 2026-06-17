// Pluggable transactional email. Uses Resend when RESEND_API_KEY is set,
// otherwise logs the link server-side so sign-up still works in dev / before
// an email provider is configured.

import { logger, maskEmail } from "@/lib/logger";

const log = logger.child({ module: "email" });

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Keep <onboarding@resend.dev>";

  if (!key) {
    // The verify URL carries a single-use account token, so only surface it in
    // development; in production just record the misconfiguration.
    if (process.env.NODE_ENV !== "production") {
      log.warn("no RESEND_API_KEY — verification link (dev only)", {
        to: maskEmail(to),
        verifyUrl,
      });
    } else {
      log.error("RESEND_API_KEY unset — cannot send verification email", {
        to: maskEmail(to),
      });
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
