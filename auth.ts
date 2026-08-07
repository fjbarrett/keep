import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { pool, ready } from "@/lib/db";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@/lib/password";
import { recordSecurityEvent } from "@/lib/audit";
import { linkGoogleAccount } from "@/lib/googleAccountLink";
import { maskEmail } from "@/lib/logger";
import { clientIpFromHeaders } from "@/lib/rateLimit";
import { checkLoginThrottle } from "@/lib/loginThrottle";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
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
          session_version: number;
        }>(
          "SELECT id, email, name, password_hash, email_verified, session_version FROM users WHERE lower(email) = $1",
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
        if (passwordNeedsRehash(user.password_hash)) {
          const upgraded = await hashPassword(password);
          await pool().query(
            `UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
            [upgraded, Date.now(), user.id],
          );
        }
        void recordSecurityEvent("login.success", {
          userId: user.id,
          headers: request?.headers,
          meta: { method: "password" },
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sessionVersion: user.session_version,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/signin" },
  callbacks: {
    // Pin the JWT sub to the stable per-provider id on initial sign-in.
    // NextAuth's OAuth callback intentionally generates a fresh randomUUID
    // for user.id (claiming identity should be provider-independent) and
    // parks the real Google sub on account.providerAccountId — so without
    // this override, every Google sign-in would mint a new sub and notes
    // saved under the previous one would look like they vanished. For the
    // password Credentials path user.id is already the stable account id.
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && account.providerAccountId) {
        token.sub = account.providerAccountId;
      } else if (user?.id) {
        token.sub = user.id;
      }
      if (!token.sub) return null;
      await ready();
      const { rows } = await pool().query<{ session_version: number }>(
        `SELECT session_version FROM users WHERE id = $1`,
        [token.sub],
      );
      const currentVersion = rows[0]?.session_version;
      if (currentVersion === undefined) return null;
      if (user) {
        token.sessionVersion = currentVersion;
      } else if (token.sessionVersion !== currentVersion) {
        // Tokens minted before session versioning carry no claim and fail this
        // comparison too — grandfathering them would exempt every pre-deploy
        // session from revocation forever (auth() in route handlers can't
        // persist an adopted claim back into the cookie). Those users simply
        // re-authenticate once.
        return null;
      }
      return token;
    },
    // Surface the stable per-account id as session.user.id so API routes can
    // use it as the owner key on notes.
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    // Mirror Google users into our `users` table so email/password sign-in
    // resolves back to the same account. Adopting a row that already holds the
    // address is a transfer of that row's notes, so the rules governing it live
    // in lib/googleAccountLink.ts with the reasoning behind them.
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const id = account.providerAccountId ?? user.id;
      if (!id) return true;
      const outcome = await linkGoogleAccount({
        id,
        email: user.email ?? null,
        emailVerified: profile?.email_verified === true,
        name: user.name ?? null,
        now: Date.now(),
      });
      if (outcome.linked) {
        void recordSecurityEvent("account.link", {
          userId: id,
          meta: {
            provider: "google",
            adoptedFrom: outcome.adoptedFrom,
            wasVerified: outcome.wasVerified,
          },
        });
      }
      return true;
    },
  },
});
