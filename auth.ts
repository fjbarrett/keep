import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { pool, ready } from "@/lib/db";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@/lib/password";
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
    // resolves back to the same account.
    //
    // The unique constraint on that table is users_email_idx — UNIQUE on
    // lower(email) (lib/db.ts) — not the primary key. So an `ON CONFLICT (id)`
    // arbiter alone never matches a row that already holds this address, and
    // the insert raises 23505 instead. Anyone can create such a row for an
    // address they don't own: /api/auth/register writes the user before the
    // verification email is answered. Left unhandled that throw is permanent,
    // and the victim can never sign in with Google at all.
    //
    // So when another row holds the address, hand that row to the Google
    // account id rather than inserting a second one, and carry its notes and
    // uploads across — jwt() keys the session on the Google sub, so a row that
    // kept its old id would leave its content stranded. Password material on an
    // unverified row is discarded with it: nobody proved they own the mailbox,
    // and keeping it would let the squatter's password open the linked account
    // the moment the real owner clicked the verification mail. A verified row is
    // the same person arriving by a second door, so its password still works.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const id = account.providerAccountId ?? user.id;
      if (!id) return true;
      const email = user.email ?? null;
      const name = user.name ?? null;
      const now = Date.now();
      await ready();

      const client = await pool().connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<{ id: string }>(
          `SELECT id FROM users
            WHERE id = $1 OR ($2::text IS NOT NULL AND lower(email) = lower($2))
            FOR UPDATE`,
          [id, email],
        );
        const squatterId = rows.find((row) => row.id !== id)?.id;
        const hasOwnRow = rows.some((row) => row.id === id);

        if (squatterId && !hasOwnRow) {
          await client.query(
            `UPDATE users
                SET id = $1,
                    name = $2,
                    updated_at = $3,
                    password_hash = CASE WHEN email_verified IS NULL THEN NULL ELSE password_hash END,
                    verify_token = CASE WHEN email_verified IS NULL THEN NULL ELSE verify_token END,
                    verify_token_expires =
                      CASE WHEN email_verified IS NULL THEN NULL ELSE verify_token_expires END
              WHERE id = $4`,
            [id, name, now, squatterId],
          );
          await client.query(`UPDATE notes SET user_id = $1 WHERE user_id = $2`, [id, squatterId]);
          await client.query(`UPDATE uploads SET user_id = $1 WHERE user_id = $2`, [id, squatterId]);
        } else {
          await client.query(
            `INSERT INTO users (id, email, name, updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE
               SET email = EXCLUDED.email,
                   name = EXCLUDED.name,
                   updated_at = EXCLUDED.updated_at`,
            [id, email, name, now],
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      return true;
    },
  },
});
