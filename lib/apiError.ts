import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isNoteQuotaError } from "@/lib/noteQuota";

/**
 * Logs the real error server-side and returns a generic 500. Routes used to
 * echo `err.message` straight back, which can leak DB schema details or the
 * DATABASE_URL hint string from lib/db — none of which a client should see.
 */
export function internalError(context: string, err: unknown) {
  if (isNoteQuotaError(err)) {
    return NextResponse.json({ error: "Note storage quota exceeded (25 MiB). Export or delete notes to make room." }, { status: 413 });
  }
  logger.error("request failed", { context, err });
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/** True for a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}
