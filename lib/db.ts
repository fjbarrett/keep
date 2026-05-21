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
      title       TEXT   NOT NULL DEFAULT '',
      body        TEXT   NOT NULL DEFAULT '',
      tint        TEXT   NOT NULL DEFAULT 'natural',
      pinned      BOOLEAN NOT NULL DEFAULT false,
      archived    BOOLEAN NOT NULL DEFAULT false,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes (updated_at DESC);
    CREATE INDEX IF NOT EXISTS notes_archived_idx ON notes (archived);
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
  tint: string;
  pinned: boolean;
  archived: boolean;
  created_at: string; // bigint comes back as string from pg
  updated_at: string;
};

export function rowToNote(r: NoteRow) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    tint: r.tint as
      | "natural"
      | "clay"
      | "rose"
      | "mist"
      | "sage"
      | "sun"
      | "violet",
    pinned: r.pinned,
    archived: r.archived,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}
