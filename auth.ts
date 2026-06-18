import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { pool, ready } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  b64urlToBytes,
  getAuthenticator,
  getUser,
  rpConfig,
  updateAuthenticatorCounter,
} from "@/lib/passkeys";
import { recordSecurityEvent } from "@/lib/audit";
import { maskEmail } from "@/lib/logger";
import { clientIpFromHeaders } from "@/lib/rateLimit";
import { checkLoginThrottle } from "@/lib/loginThrottle";

export async function storeChallenge(challenge: string) {
  await ready();
  await pool().query(
    `DELETE FROM passkey_challenges WHERE expires_at < $1`,
    [Date.now()],
  );
  await pool().query(
    `INSERT INTO passkey_challenges (challenge, expires_at) VALUES ($1, $2)`,
    [challenge, Date.now() + 5 * 60_000],
  );
}

export async function consumeChallenge(challenge: string): Promise<boolean> {
  await ready();
  const { rowCount } = await pool().query(
    `DELETE FROM passkey_challenges WHERE challenge = $1 AND expires_at > $2`,
    [challenge, Date.now()],
  );
  return (rowCount ?? 0) > 0;
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

        // The account isn't known until we resolve the assertion, so throttle by
        // IP only — enough to stop a flood of passkey-verify work from one host.
        const ip = request?.headers ? clientIpFromHeaders(request.headers) : "unknown";
        if (!checkLoginThrottle(ip, null).allowed) {
          void recordSecurityEvent("login.failure", {
            headers: request?.headers,
            meta: { method: "passkey", reason: "rate_limited" },
          });
          return null;
        }

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
        if (!challenge || !(await consumeChallenge(challenge))) return null;

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
        if (!verification.verified) {
          void recordSecurityEvent("login.failure", {
            userId: stored.user_id,
            headers: request?.headers,
            meta: { method: "passkey", reason: "verify_failed" },
          });
          return null;
        }

        await updateAuthenticatorCounter(
          stored.credential_id,
          verification.authenticationInfo.newCounter,
        );

        const user = await getUser(stored.user_id);
        void recordSecurityEvent("login.success", {
          userId: stored.user_id,
          headers: request?.headers,
          meta: { method: "passkey" },
        });
        return {
          id: stored.user_id,
          email: user?.email ?? null,
          name: user?.name ?? null,
        };
      },
    }),
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        // Throttle before the DB hit and scrypt: per-IP stops a spray (and the
        // scrypt CPU-DoS), per-account slows targeted guessing across rotating
        // IPs. Blocked attempts fail the same null way as a bad password.
        const ip = request?.headers ? clientIpFromHeaders(request.headers) : "unknown";
        const throttle = checkLoginThrottle(ip, email);
        if (!throttle.allowed) {
          void recordSecurityEvent("login.failure", {
            headers: request?.headers,
            meta: { method: "password", reason: "rate_limited", scope: throttle.scope, email: maskEmail(email) },
          });
          return null;
        }
        await ready();
        const { rows } = await pool().query<{
          id: string;
          email: string | null;
          name: string | null;
          password_hash: string | null;
          email_verified: string | null;
        }>(
          "SELECT id, email, name, password_hash, email_verified FROM users WHERE lower(email) = $1",
          [email],
        );
        const user = rows[0];
        const fail = (reason: string) => {
          void recordSecurityEvent("login.failure", {
            userId: user?.id ?? null,
            headers: request?.headers,
            meta: { method: "password", reason, email: maskEmail(email) },
          });
          return null;
        };
        if (!user?.password_hash) return fail("no_account");
        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return fail("bad_password");
        // Require a verified email before issuing a session. Fail the same way
        // as a bad password (null, not a distinct error) so we don't reveal
        // which addresses have registered-but-unverified accounts.
        if (!user.email_verified) return fail("unverified");
        void recordSecurityEvent("login.success", {
          userId: user.id,
          headers: request?.headers,
          meta: { method: "password" },
        });
        return { id: user.id, email: user.email, name: user.name };
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
