import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rpConfig } from "@/lib/passkeys";

export const runtime = "nodejs";

export const PASSKEY_AUTH_CHALLENGE_COOKIE = "keep_passkey_auth_challenge";

export async function POST() {
  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    // Empty allowCredentials → discoverable credentials, so the browser can
    // surface every passkey it has for this origin via conditional UI.
    allowCredentials: [],
  });

  const res = NextResponse.json(options);
  res.cookies.set(PASSKEY_AUTH_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return res;
}
