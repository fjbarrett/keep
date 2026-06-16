// Pluggable transactional email. Uses Resend when RESEND_API_KEY is set,
// otherwise logs the link server-side so sign-up still works in dev / before
// an email provider is configured.

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Keep <onboarding@resend.dev>";

  if (!key) {
    // The verify URL carries a single-use account token, so only log it in
    // development; in production just note the misconfiguration.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] (no RESEND_API_KEY) verification link for ${to}: ${verifyUrl}`);
    } else {
      console.error(`[email] RESEND_API_KEY unset — cannot send verification email to ${to}`);
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
