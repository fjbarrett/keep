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

const PASSKEY_AUTH_CHALLENGE_COOKIE = "keep_passkey_auth_challenge";

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

        const challenge = request.headers
          .get("cookie")
          ?.split(/;\s*/)
          .find((c) => c.startsWith(`${PASSKEY_AUTH_CHALLENGE_COOKIE}=`))
          ?.slice(PASSKEY_AUTH_CHALLENGE_COOKIE.length + 1);
        if (!challenge) return null;

        const stored = await getAuthenticator(assertion.id);
        if (!stored) return null;

        // Conditional UI doesn't pre-select an account, so the userHandle is
        // how we tie the assertion back to a user — it must match the row.
        const handle = assertion.response.userHandle;
        if (handle && Buffer.from(handle, "base64url").toString() !== stored.user_id) {
          return null;
        }

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
    // Surface the Google `sub` (stable per-account ID) as session.user.id so
    // API routes can use it as the owner key on notes without having to look
    // anything up in the DB. The Credentials/passkey path returns the same
    // id, so the JWT sub stays consistent across both sign-in methods.
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
