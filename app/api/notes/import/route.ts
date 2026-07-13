import crypto from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { KeepImportNote, parseGoogleKeepImport } from "@/lib/googleKeepImport";
import { pool, ready } from "@/lib/db";
import { heuristicNoteMeta } from "@/lib/titleModel";
import { internalError } from "@/lib/apiError";
import { readFormDataBody, requestBodyError } from "@/lib/requestBody";
import { MAX_NOTES_PER_USER } from "@/lib/noteLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bound the raw upload before we even read it into memory; the parser then caps
// note count and decompressed size to defend against zip bombs.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

// Deterministic 128-bit id so re-importing the same note dedupes via ON CONFLICT.
function googleKeepImportId(userId: string, note: KeepImportNote) {
  return crypto
    .createHash("sha1")
    .update(userId)
    .update("\0")
    .update(note.sourceName)
    .update("\0")
    .update(String(note.createdAt))
    .digest("hex")
    .slice(0, 32);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await readFormDataBody(req, MAX_MULTIPART_BYTES);
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a Takeout ZIP or Keep JSON file" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "That file is too large to import (max 20 MB)." },
        { status: 413 },
      );
    }

    const { notes, skipped, truncated } = await parseGoogleKeepImport(
      file.name,
      await file.arrayBuffer(),
    );
    const importable = notes.filter((note) => !note.trashed);

    await ready();
    const usage = await pool().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notes WHERE user_id = $1`,
      [session.user.id],
    );
    const available = Math.max(0, MAX_NOTES_PER_USER - Number(usage.rows[0]?.count ?? 0));
    const withinQuota = importable.slice(0, available);
    let imported = 0;
    for (const note of withinQuota) {
      // Heuristic title/summary only — a per-note model call would turn one
      // upload into N billed Anthropic requests.
      const meta = heuristicNoteMeta(note.body);
      const result = await pool().query(
        `INSERT INTO notes (id, user_id, title, summary, body, pinned, archived, trashed, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          googleKeepImportId(session.user.id, note),
          session.user.id,
          meta.title,
          meta.summary,
          note.body,
          note.pinned,
          note.archived,
          note.createdAt,
          note.updatedAt,
        ],
      );
      imported += result.rowCount ?? 0;
    }

    return NextResponse.json({
      imported,
      skipped: skipped + notes.length - importable.length,
      duplicates: withinQuota.length - imported,
      truncated: truncated || withinQuota.length < importable.length,
    });
  } catch (err) {
    const tooLarge = requestBodyError(err, "That file is too large to import (max 20 MB).");
    if (tooLarge) return tooLarge;
    return internalError("notes:import", err);
  }
}
