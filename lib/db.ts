import { Pool } from "pg";

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

  // Self-signed certs on a self-installed Postgres are the norm — trust the
  // host and encrypt the wire. (DO-managed clusters give you a real CA cert
  // you could pin instead; we don't have that here.)
  const ssl =
    wantSSL || sslmode !== null
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
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
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

    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT,
      name       TEXT,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      credential_id TEXT PRIMARY KEY,
      user_id       TEXT   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key    BYTEA  NOT NULL,
      counter       BIGINT NOT NULL DEFAULT 0,
      transports    TEXT   NOT NULL DEFAULT '[]',
      name          TEXT   NOT NULL DEFAULT '',
      created_at    BIGINT NOT NULL,
      last_used_at  BIGINT
    );
    CREATE INDEX IF NOT EXISTS authenticators_user_idx ON authenticators (user_id);
  `);
}

export function ready(): Promise<void> {
  if (!global.__keepReady) global.__keepReady = bootstrap();
  return global.__keepReady;
}

export type NoteRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  markdown: boolean;
  tags: string[] | null;
  share_token: string | null;
  created_at: string; // bigint comes back as string from pg
  updated_at: string;
};

export function rowToNote(r: NoteRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    pinned: r.pinned,
    archived: r.archived,
    trashed: r.trashed,
    markdown: Boolean(r.markdown),
    tags: r.tags ?? [],
    shareToken: r.share_token,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

// 8 base36 chars (~2.8e12 keyspace) is plenty for a per-user notes app and
// keeps the URL short. Existing longer IDs still work — they're opaque strings.
export function newId(): string {
  let id = "";
  while (id.length < 8) {
    id += Math.random().toString(36).slice(2);
  }
  return id.slice(0, 8).toUpperCase();
}
