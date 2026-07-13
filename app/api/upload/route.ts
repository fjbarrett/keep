import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { newId, pool, ready } from "@/lib/db";
import { deletePrivateFile, putPrivateFile, storageConfigured } from "@/lib/storage";
import { hasValidImageSignature, imageExtension, isAllowedImageType } from "@/lib/imageUpload";
import { internalError } from "@/lib/apiError";
import { readFormDataBody, requestBodyError } from "@/lib/requestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 256 * 1024;
const MAX_USER_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!storageConfigured()) {
    return NextResponse.json({ error: "Image uploads not configured" }, { status: 501 });
  }

  try {
    const form = await readFormDataBody(req, MAX_MULTIPART_BYTES);
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
    }
    if (!isAllowedImageType(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasValidImageSignature(bytes, file.type)) {
      return NextResponse.json({ error: "File content does not match its image type" }, { status: 400 });
    }

    await ready();
    const id = newId();
    const path = `keep/${session.user.id}/${id}.${imageExtension(file.type)}`;
    const client = await pool().connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [session.user.id]);
      const usage = await client.query<{ bytes: string }>(
        `SELECT coalesce(sum(size), 0)::text AS bytes FROM uploads WHERE user_id = $1`,
        [session.user.id],
      );
      if (Number(usage.rows[0]?.bytes ?? 0) + file.size > MAX_USER_UPLOAD_BYTES) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Upload storage quota exceeded" }, { status: 413 });
      }
      await client.query(
        `INSERT INTO uploads (id, user_id, storage_key, content_type, size, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, session.user.id, path, file.type, file.size, Date.now()],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    try {
      await putPrivateFile(path, bytes, file.type);
    } catch (err) {
      await pool().query(`DELETE FROM uploads WHERE id = $1 AND user_id = $2`, [
        id,
        session.user.id,
      ]).catch(() => {});
      await deletePrivateFile(path).catch(() => {});
      throw err;
    }
    return NextResponse.json({ url: `/api/uploads/${id}` });
  } catch (err) {
    const tooLarge = requestBodyError(err, "File too large (max 4 MB)");
    if (tooLarge) return tooLarge;
    return internalError("upload:create", err);
  }
}
