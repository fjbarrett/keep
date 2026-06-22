import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { pool, ready } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { normalizeUsername } from "@/lib/username";
import { recordSecurityEvent } from "@/lib/audit";
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
    Credentials({
      id: "username",
      name: "Username and passphrase",
      credentials: { username: { type: "text" }, password: { type: "password" } },
      async authorize(credentials, request) {
        const username = normalizeUsername(String(credentials?.username ?? ""));
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;

        // Same pre-hash throttle as the password path; the account key is the
        // normalized username. On an onion service the client IP is always
        // "unknown" (no source IP survives the rendezvous), so the per-account
        // budget is what actually slows targeted guessing there.
        const ip = request?.headers ? clientIpFromHeaders(request.headers) : "unknown";
        const throttle = checkLoginThrottle(ip, `username:${username}`);
        if (!throttle.allowed) {
          void recordSecurityEvent("login.failure", {
            headers: request?.headers,
            meta: { method: "username", reason: "rate_limited", scope: throttle.scope, username },
          });
          return null;
        }
        await ready();
        const { rows } = await pool().query<{
          id: string;
          username: string | null;
          password_hash: string | null;
        }>(
          "SELECT id, username, password_hash FROM users WHERE lower(username) = $1",
          [username],
        );
        const user = rows[0];
        const fail = (reason: string) => {
          void recordSecurityEvent("login.failure", {
            userId: user?.id ?? null,
            headers: request?.headers,
            meta: { method: "username", reason, username },
          });
          return null;
        };
        if (!user?.password_hash) return fail("no_account");
        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return fail("bad_password");
        // No email_verified gate: username accounts have no email by design, so
        // there's nothing to verify — they're usable the moment they're created.
        void recordSecurityEvent("login.success", {
          userId: user.id,
          headers: request?.headers,
          meta: { method: "username" },
        });
        // name carries the display capitalization so the header shows it.
        return { id: user.id, email: null, name: user.username };
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
    // password Credentials path user.id is already the stable account id.
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
    // Mirror Google users into our `users` table so email/password sign-in and
    // per-account settings (enc_salt) resolve back to the same account.
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
