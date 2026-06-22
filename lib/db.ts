import { readFileSync } from "fs";
import { Pool } from "pg";
import { logger } from "@/lib/logger";

// CA certificate for verifying the Postgres server's TLS cert. DATABASE_CA_CERT
// may be the PEM contents inline or a path to a .pem/.crt file. When set, the
// connection verifies the server identity (rejectUnauthorized: true); when
// unset we fall back to encrypt-but-don't-verify for self-signed localhost.
export function caCert(): string | undefined {
  const raw = process.env.DATABASE_CA_CERT;
  if (!raw || !raw.trim()) return undefined;
  // Inline PEM is used verbatim; anything else is treated as a file path.
  return raw.includes("BEGIN CERTIFICATE") ? raw : readFileSync(raw.trim(), "utf8");
}

declare global {
  // eslint-disable-next-line no-var
  var __keepPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __keepReady: Promise<void> | undefined;
}

function makePool(): Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local — e.g. postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require",
    );
  }

  // Detect whether SSL was requested in the URL, then strip it from the
  // connection string so pg doesn't override our explicit ssl options below.
  // (pg parses sslmode=require into ssl:true which discards rejectUnauthorized.)
  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  const wantSSL =
    sslmode === "require" ||
    sslmode === "prefer" ||
    sslmode === "verify-ca" ||
    sslmode === "verify-full" ||
    sslmode === "no-verify";
  url.searchParams.delete("sslmode");
  const connectionString = url.toString();

  // With a CA cert configured, verify the server's identity (defends against a
  // MITM on the DB connection). Without one, fall back to encrypt-but-don't-
  // verify — the norm for a self-signed Postgres on the same host.
  const ca = caCert();
  const ssl = ca
    ? { ca, rejectUnauthorized: true }
    : wantSSL || sslmode !== null
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    connectionString,
    ssl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });
}

export function pool(): Pool {
  if (!global.__keepPool) global.__keepPool = makePool();
  return global.__keepPool;
}

async function bootstrap(): Promise<void> {
  await pool().query(`
    CREATE TABLE IF NOT EXISTS notes (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      title       TEXT   NOT NULL DEFAULT '',
      body        TEXT   NOT NULL DEFAULT '',
      pinned      BOOLEAN NOT NULL DEFAULT false,
      archived    BOOLEAN NOT NULL DEFAULT false,
      trashed     BOOLEAN NOT NULL DEFAULT false,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    );
    -- Pre-auth installs had no user_id column; add it idempotently. Left
    -- nullable so any orphaned rows from before auth don't block the migration
    -- — they simply won't match any user_id filter.
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS trashed BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE notes DROP COLUMN IF EXISTS tint;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS share_token TEXT;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS markdown BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS highlight BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
    -- AI-generated one-line card description; NULL means "fall back to a body preview".
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS summary TEXT;
    -- Optional color label key (blue, pink, …); NULL means no label.
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS color TEXT;
    CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (updated_at DESC);
    CREATE INDEX IF NOT EXISTS notes_tags_idx ON notes USING GIN (tags);
    CREATE INDEX IF NOT EXISTS notes_archived_idx ON notes (archived);
    CREATE INDEX IF NOT EXISTS notes_trashed_idx ON notes (trashed);
    CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS notes_share_token_idx ON notes (share_token) WHERE share_token IS NOT NULL;

    CREATE TABLE IF NOT EXISTS note_versions (
      id          TEXT PRIMARY KEY,
      note_id     TEXT NOT NULL,
      body        TEXT NOT NULL DEFAULT '',
      title       TEXT NOT NULL DEFAULT '',
      created_at  BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS note_versions_note_idx ON note_versions (note_id, created_at DESC);

    -- Short-lived handoff codes for native (iOS) Google sign-in. The native app
    -- can't read the session cookie out of ASWebAuthenticationSession's browser
    -- jar, so the /native/bridge route mints a single-use code bound to the
    -- freshly-issued session cookie; /api/native/exchange trades it back for the
    -- cookie. High-entropy, ~60s TTL, deleted on use — never leaves the server
    -- in a URL. Expired rows are swept lazily on write.
    CREATE TABLE IF NOT EXISTS native_auth_codes (
      code         TEXT PRIMARY KEY,
      cookie_name  TEXT   NOT NULL,
      cookie_value TEXT   NOT NULL,
      expires_at   BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT,
      name       TEXT,
      updated_at BIGINT NOT NULL
    );
    -- enc_salt stores a random 32-byte hex salt used by the client to derive
    -- the AES-GCM encryption key via PBKDF2. NULL means encryption is disabled.
    -- The salt is public; only the passphrase (never sent to the server) is secret.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS enc_salt TEXT;
    -- Email + password auth (additive; Google users have a null password_hash).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BIGINT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT;
    -- Expiry for verify_token so a leaked link can't be redeemed indefinitely.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_expires BIGINT;
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (lower(email)) WHERE email IS NOT NULL;

    -- Passkeys were removed; drop their tables idempotently so existing installs
    -- shed the now-unused credentials and challenge rows on next boot.
    DROP TABLE IF EXISTS authenticators;
    DROP TABLE IF EXISTS passkey_challenges;

    -- Durable security audit trail (see lib/audit.ts). Rows are account-centric
    -- events — failed/successful logins, registrations, share-link create/revoke
    -- — with masked IPs and no secrets. Queryable by user or by event for abuse
    -- triage, unlike the ephemeral journald logs.
    CREATE TABLE IF NOT EXISTS security_events (
      id          TEXT PRIMARY KEY,
      ts          BIGINT NOT NULL,
      event       TEXT   NOT NULL,
      user_id     TEXT,
      ip          TEXT,
      user_agent  TEXT,
      meta        JSONB  NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS security_events_ts_idx ON security_events (ts DESC);
    CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events (user_id, ts DESC);
    CREATE INDEX IF NOT EXISTS security_events_event_idx ON security_events (event, ts DESC);

    -- Privacy-first product analytics (see lib/analytics.ts). Anonymous: no
    -- cookies, no stored IPs, dynamic paths collapsed to route patterns, and
    -- "visitor" is a daily-rotating salted hash (not a persistent identifier).
    CREATE TABLE IF NOT EXISTS analytics_events (
      id        TEXT PRIMARY KEY,
      ts        BIGINT NOT NULL,
      type      TEXT NOT NULL,
      path      TEXT,
      referrer  TEXT,
      visitor   TEXT,
      device    TEXT
    );
    CREATE INDEX IF NOT EXISTS analytics_events_ts_idx ON analytics_events (ts DESC);
    CREATE INDEX IF NOT EXISTS analytics_events_path_idx ON analytics_events (path, ts DESC);
    CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON analytics_events (visitor, ts DESC);
  `);
}

// Re-IDs any note that predates the 8-hex-char convention (old 12-char ids,
// GK-import ids, …) to a fresh 8-char id, carrying its note_versions along.
// Idempotent: once every id matches ^[0-9a-f]{8}$ this is a no-op. Each note is
// migrated in its own transaction so a failure mid-run is safe and resumable.
async function migrateNoteIds(): Promise<void> {
  const legacy = await pool().query<{ id: string }>(
    `SELECT id FROM notes WHERE id !~ '^[0-9a-f]{8}$'`,
  );
  if (legacy.rows.length === 0) return;
  const used = new Set(
    (await pool().query<{ id: string }>(`SELECT id FROM notes`)).rows.map((r) => r.id),
  );
  for (const { id: oldId } of legacy.rows) {
    let next = newId();
    while (used.has(next)) next = newId();
    used.add(next);
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE note_versions SET note_id = $1 WHERE note_id = $2`, [next, oldId]);
      await client.query(`UPDATE notes SET id = $1 WHERE id = $2`, [next, oldId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // Don't brick the app over one row — log and let the next boot retry it.
      logger.error("note id migration failed", { oldId, err });
    } finally {
      client.release();
    }
  }
}

export function ready(): Promise<void> {
  if (!global.__keepReady) {
    global.__keepReady = bootstrap().then(() => migrateNoteIds());
  }
  return global.__keepReady;
}

export type NoteRow = {
  id: string;
  title: string;
  summary: string | null;
  color: string | null;
  body: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  markdown: boolean;
  highlight: boolean;
  tags: string[] | null;
  share_token: string | null;
  created_at: string; // bigint comes back as string from pg
  updated_at: string;
};

export function rowToNote(r: NoteRow) {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? null,
    color: r.color ?? null,
    body: r.body,
    pinned: r.pinned,
    archived: r.archived,
    trashed: r.trashed,
    markdown: Boolean(r.markdown),
    highlight: Boolean(r.highlight),
    tags: r.tags ?? [],
    shareToken: r.share_token,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// 8 lowercase hex chars from a UUID v4 — 32 bits, and parseInt(id, 16) maps it
// to a single integer (MAC-address style, no separators).
export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}
