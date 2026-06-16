import crypto from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { KeepImportNote, parseGoogleKeepImport } from "@/lib/googleKeepImport";
import { pool, ready } from "@/lib/db";
import { heuristicNoteMeta } from "@/lib/titleModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bound the raw upload before we even read it into memory; the parser then caps
// note count and decompressed size to defend against zip bombs.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Deterministic 8-hex id so re-importing the same note dedupes via ON CONFLICT,
// while still matching the app-wide 8-char id convention.
function googleKeepImportId(userId: string, note: KeepImportNote) {
  return crypto
    .createHash("sha1")
    .update(userId)
    .update("\0")
    .update(note.sourceName)
    .update("\0")
    .update(String(note.createdAt))
    .digest("hex")
    .slice(0, 8);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
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
    let imported = 0;
    for (const note of importable) {
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
      duplicates: importable.length - imported,
      truncated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
