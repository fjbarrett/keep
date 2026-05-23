import { pool, ready } from "@/lib/db";

// Passkeys are scoped to a single rpID. Pin to PASSKEY_RP_ID in production
// (e.g. "keepkeep.vercel.app") so credentials registered there don't break
// on per-preview Vercel URLs. Falls back to NEXTAUTH_URL/AUTH_URL for local dev.
export function rpConfig() {
  const pinned = process.env.PASSKEY_RP_ID;
  const raw =
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000";
  const url = new URL(raw);
  const rpID = pinned || url.hostname;
  const origin = pinned ? `https://${pinned}` : url.origin;
  return { rpID, rpName: "Keep", origin };
}

export type AuthenticatorRow = {
  credential_id: string;
  user_id: string;
  public_key: Buffer;
  counter: string;
  transports: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
};

export async function listAuthenticators(userId: string) {
  await ready();
  const { rows } = await pool().query<AuthenticatorRow>(
    `SELECT credential_id, user_id, public_key, counter, transports, name,
            created_at, last_used_at
       FROM authenticators
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getAuthenticator(credentialId: string) {
  await ready();
  const { rows } = await pool().query<AuthenticatorRow>(
    `SELECT credential_id, user_id, public_key, counter, transports, name,
            created_at, last_used_at
       FROM authenticators
      WHERE credential_id = $1`,
    [credentialId],
  );
  return rows[0] ?? null;
}

export async function insertAuthenticator(input: {
  credentialId: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  name: string;
}) {
  await ready();
  await pool().query(
    `INSERT INTO authenticators
       (credential_id, user_id, public_key, counter, transports, name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.credentialId,
      input.userId,
      Buffer.from(input.publicKey),
      input.counter,
      JSON.stringify(input.transports),
      input.name,
      Date.now(),
    ],
  );
}

export async function updateAuthenticatorCounter(
  credentialId: string,
  counter: number,
) {
  await ready();
  await pool().query(
    `UPDATE authenticators
        SET counter = $2, last_used_at = $3
      WHERE credential_id = $1`,
    [credentialId, counter, Date.now()],
  );
}

export async function deleteAuthenticator(credentialId: string, userId: string) {
  await ready();
  const result = await pool().query(
    `DELETE FROM authenticators WHERE credential_id = $1 AND user_id = $2`,
    [credentialId, userId],
  );
  return result.rowCount ?? 0;
}

export async function getUser(userId: string) {
  await ready();
  const { rows } = await pool().query<{
    id: string;
    email: string | null;
    name: string | null;
  }>(`SELECT id, email, name FROM users WHERE id = $1`, [userId]);
  return rows[0] ?? null;
}

export type PublicAuthenticator = {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};

export function b64urlToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

export function bytesToB64url(b: Uint8Array): string {
  return Buffer.from(b).toString("base64url");
}

export function toPublic(row: AuthenticatorRow): PublicAuthenticator {
  return {
    id: row.credential_id,
    name: row.name,
    createdAt: Number(row.created_at),
    lastUsedAt: row.last_used_at ? Number(row.last_used_at) : null,
  };
}
