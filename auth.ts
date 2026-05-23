import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { pool, ready } from "@/lib/db";
import {
  b64urlToBytes,
  getAuthenticator,
  getUser,
  rpConfig,
  updateAuthenticatorCounter,
} from "@/lib/passkeys";

const challengeStore = new Map<string, { challenge: string; expires: number }>();

export function storeChallenge(challenge: string) {
  const now = Date.now();
  for (const [k, v] of challengeStore) {
    if (v.expires < now) challengeStore.delete(k);
  }
  challengeStore.set(challenge, { challenge, expires: now + 5 * 60_000 });
}

export function consumeChallenge(challenge: string): boolean {
  const entry = challengeStore.get(challenge);
  if (!entry || entry.expires < Date.now()) return false;
  challengeStore.delete(challenge);
  return true;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
      id: "passkey",
      name: "Passkey",
      credentials: { assertion: { type: "text" } },
      async authorize(credentials, request) {
        const raw = credentials?.assertion;
        if (typeof raw !== "string") return null;
        let assertion: AuthenticationResponseJSON;
        try {
          assertion = JSON.parse(raw);
        } catch {
          return null;
        }

        const stored = await getAuthenticator(assertion.id);
        if (!stored) return null;

        // Conditional UI doesn't pre-select an account, so the userHandle is
        // how we tie the assertion back to a user — it must match the row.
        const handle = assertion.response.userHandle;
        if (handle && Buffer.from(handle, "base64url").toString() !== stored.user_id) {
          return null;
        }

        const clientData = JSON.parse(
          Buffer.from(assertion.response.clientDataJSON, "base64url").toString(),
        );
        const challenge = clientData.challenge;
        if (!challenge || !consumeChallenge(challenge)) return null;

        const { rpID, origin } = rpConfig();
        const verification = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          authenticator: {
            credentialID: b64urlToBytes(stored.credential_id),
            credentialPublicKey: new Uint8Array(stored.public_key),
            counter: Number(stored.counter),
          },
          requireUserVerification: false,
        });
        if (!verification.verified) return null;

        await updateAuthenticatorCounter(
          stored.credential_id,
          verification.authenticationInfo.newCounter,
        );

        const user = await getUser(stored.user_id);
        return {
          id: stored.user_id,
          email: user?.email ?? null,
          name: user?.name ?? null,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    // Pin the JWT sub to the stable per-provider id on initial sign-in.
    // NextAuth's OAuth callback intentionally generates a fresh randomUUID
    // for user.id (claiming identity should be provider-independent) and
    // parks the real Google sub on account.providerAccountId — so without
    // this override, every Google sign-in would mint a new sub and notes
    // saved under the previous one would look like they vanished. For the
    // Credentials/passkey path user.id is already the Google sub.
    jwt({ token, user, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        token.sub = account.providerAccountId;
      } else if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    // Surface the stable per-account id as session.user.id so API routes can
    // use it as the owner key on notes.
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    // Mirror the user into our `users` table so passkeys (which only carry a
    // credential ID at sign-in time) can resolve back to the same account.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const id = account.providerAccountId ?? user.id;
      if (!id) return true;
      await ready();
      await pool().query(
        `INSERT INTO users (id, email, name, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET email = EXCLUDED.email,
               name = EXCLUDED.name,
               updated_at = EXCLUDED.updated_at`,
        [id, user.email ?? null, user.name ?? null, Date.now()],
      );
      return true;
    },
  },
});
