import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { auth } from "@/auth";
import {
  bytesToB64url,
  insertAuthenticator,
  rpConfig,
  upsertUser,
} from "@/lib/passkeys";

export const runtime = "nodejs";

const CHALLENGE_COOKIE = "keep_passkey_reg_challenge";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    response: RegistrationResponseJSON;
    name?: string;
  };

  const challenge = cookies().get(CHALLENGE_COOKIE)?.value;
  if (!challenge) {
    return NextResponse.json({ error: "missing challenge" }, { status: 400 });
  }

  const { rpID, origin } = rpConfig();
  const verification = await verifyRegistrationResponse({
    response: body.response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "verification failed" }, { status: 400 });
  }

  // Ensure a users row exists for the FK on authenticators.user_id. Pre-existing
  // sessions from before the Google signIn callback shipped won't have one.
  await upsertUser({
    id: userId,
    email: session.user?.email ?? null,
    name: session.user?.name ?? null,
  });

  const info = verification.registrationInfo;
  await insertAuthenticator({
    credentialId: bytesToB64url(info.credentialID),
    userId,
    publicKey: info.credentialPublicKey,
    counter: info.counter ?? 0,
    transports: body.response.response.transports ?? [],
    name: (body.name || defaultName()).slice(0, 64),
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(CHALLENGE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function defaultName() {
  return `Passkey · ${new Date().toLocaleDateString()}`;
}
