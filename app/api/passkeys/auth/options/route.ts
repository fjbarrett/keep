import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rpConfig } from "@/lib/passkeys";
import { storeChallenge } from "@/auth";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";

export const runtime = "nodejs";

// Unauthenticated (runs before a session exists) and writes a challenge row
// each call — cap per-IP so it can't be used to flood the challenge table.
const optionsRateLimit = createTokenBucketRateLimiter({
  limit: 20,
  windowMs: 60_000,
});

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(
    optionsRateLimit,
    req.headers,
    "passkey-auth-options",
    "Too many attempts. Try again shortly.",
  );
  if (limited) return limited;

  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: [],
  });

  await storeChallenge(options.challenge);
  return NextResponse.json(options);
}
