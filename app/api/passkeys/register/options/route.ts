import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { auth } from "@/auth";
import {
  b64urlToBytes,
  getUser,
  listAuthenticators,
  rpConfig,
} from "@/lib/passkeys";

export const runtime = "nodejs";

const CHALLENGE_COOKIE = "keep_passkey_reg_challenge";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rpID, rpName } = rpConfig();
  const user = await getUser(userId);
  const existing = await listAuthenticators(userId);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userId,
    userName: user?.email ?? session.user?.email ?? userId,
    userDisplayName: user?.name ?? session.user?.name ?? user?.email ?? userId,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((row) => ({
      id: b64urlToBytes(row.credential_id),
      type: "public-key" as const,
      transports: safeTransports(row.transports),
    })),
  });

  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return res;
}

function safeTransports(raw: string): AuthenticatorTransportFuture[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as AuthenticatorTransportFuture[];
  } catch {}
  return [];
}
