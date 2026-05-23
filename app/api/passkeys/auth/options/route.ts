import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rpConfig } from "@/lib/passkeys";
import { storeChallenge } from "@/auth";

export const runtime = "nodejs";

export async function POST() {
  const { rpID } = rpConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: [],
  });

  await storeChallenge(options.challenge);
  return NextResponse.json(options);
}
