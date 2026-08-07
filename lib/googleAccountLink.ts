import { pool, ready } from "@/lib/db";

export type GoogleIdentity = {
  /** Google's stable `sub`. Every session for this account is keyed on it. */
  id: string;
  email: string | null;
  /** Google's `email_verified` claim, passed through untouched. */
  emailVerified: boolean;
  name: string | null;
  now: number;
};

export type LinkOutcome =
  | { linked: false }
  | { linked: true; adoptedFrom: string; wasVerified: boolean };

/**
 * Mirror a Google user into `users` so email/password sign-in resolves back to
 * the same account.
 *
 * The unique constraint on that table is users_email_idx, UNIQUE on lower(email)
 * (lib/db.ts), rather than the primary key. An `ON CONFLICT (id)` arbiter alone
 * therefore never matches a row that already holds this address, and the insert
 * raises 23505 instead. Anyone can plant such a row: /api/auth/register writes
 * the user before the verification email is answered. Unhandled, that throw is
 * permanent, and the victim can never sign in with Google at all.
 *
 * So when another row holds the address, hand that row to the Google account id
 * instead of inserting beside it, and carry its notes and uploads across. jwt()
 * keys the session on the Google sub, so a row that kept its old id would leave
 * its content unreachable from either sign-in path.
 *
 * Two rules keep that hand-off from becoming a takeover.
 *
 * The address has to be one Google asserts as verified. Matching on lower(email)
 * is what decides whose notes move, so an unverified claim must never be able to
 * aim at another account's row.
 *
 * The adopted row's password material always goes. email_verified records that
 * someone opened the mailbox, never that they chose the password sitting in the
 * row: register stores password_hash before anyone answers the mail, so a
 * stranger's password plus the owner's click on that genuine link would leave
 * the stranger holding a working credential on the linked account. Someone who
 * really did own both doors keeps the Google one and loses the password.
 */
export async function linkGoogleAccount(identity: GoogleIdentity): Promise<LinkOutcome> {
  const { id, name, now } = identity;
  const email = identity.emailVerified ? identity.email : null;
  await ready();

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; email_verified: string | null }>(
      `SELECT id, email_verified FROM users
        WHERE id = $1 OR ($2::text IS NOT NULL AND lower(email) = lower($2))
        FOR UPDATE`,
      [id, email],
    );
    const squatter = rows.find((row) => row.id !== id);
    const hasOwnRow = rows.some((row) => row.id === id);

    let outcome: LinkOutcome = { linked: false };
    if (squatter && !hasOwnRow) {
      await client.query(
        `UPDATE users
            SET id = $1,
                name = $2,
                updated_at = $3,
                password_hash = NULL,
                verify_token = NULL,
                verify_token_expires = NULL
          WHERE id = $4`,
        [id, name, now, squatter.id],
      );
      // security_events keeps its original user_id: it is an audit trail of what
      // happened under that id, not state to migrate.
      await client.query(`UPDATE notes SET user_id = $1 WHERE user_id = $2`, [id, squatter.id]);
      await client.query(`UPDATE uploads SET user_id = $1 WHERE user_id = $2`, [id, squatter.id]);
      outcome = {
        linked: true,
        adoptedFrom: squatter.id,
        wasVerified: squatter.email_verified !== null,
      };
    } else {
      await client.query(
        `INSERT INTO users (id, email, name, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET email = COALESCE(EXCLUDED.email, users.email),
               name = EXCLUDED.name,
               updated_at = EXCLUDED.updated_at`,
        [id, email, name, now],
      );
    }
    await client.query("COMMIT");
    return outcome;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
