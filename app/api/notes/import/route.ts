import crypto from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { KeepImportNote, parseGoogleKeepImport } from "@/lib/googleKeepImport";
import { pool, ready } from "@/lib/db";
import { generateNoteMeta } from "@/lib/titleModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function googleKeepImportId(userId: string, note: KeepImportNote) {
  return `GK${crypto
    .createHash("sha1")
    .update(userId)
    .update("\0")
    .update(note.sourceName)
    .update("\0")
    .update(String(note.createdAt))
    .digest("hex")
    .slice(0, 22)
    .toUpperCase()}`;
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

    const { notes, skipped } = await parseGoogleKeepImport(
      file.name,
      await file.arrayBuffer(),
    );
    const importable = notes.filter((note) => !note.trashed);

    await ready();
    let imported = 0;
    for (const note of importable) {
      const meta = await generateNoteMeta(note.body);
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
