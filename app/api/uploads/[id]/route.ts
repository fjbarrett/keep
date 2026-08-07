import { auth } from "@/auth";
import { pool, ready } from "@/lib/db";
import { internalError } from "@/lib/apiError";
import { deletePrivateFile, getPrivateFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRow = {
  storage_key: string;
  content_type: string;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 });

  const session = await auth();
  const raw = new URL(req.url).searchParams.get("share") ?? "";
  const share = /^[A-Za-z0-9_-]{3,40}$/.test(raw) ? raw : null;

  try {
    await ready();
    // Authorization is part of the lookup, like every other query here, so the
    // row is never in hand before something has justified reading it. The share
    // arm is the one legitimate non-owner read: it matches only a live shared
    // note owned by the same account that actually embeds this upload, so a
    // token can't be aimed at another account's attachments. Both misses return
    // no row, and the caller can't tell a private upload from a missing one.
    const { rows } = await pool().query<UploadRow>(
      `SELECT u.storage_key, u.content_type
         FROM uploads u
        WHERE u.id = $1
          AND (
            u.user_id = $2
            OR (
              $3::text IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM notes n
                 WHERE n.user_id = u.user_id
                   AND n.share_token = $3
                   AND n.trashed = false
                   AND position($4 in n.body) > 0
              )
            )
          )`,
      [id, session?.user?.id ?? null, share, `/api/uploads/${id}`],
    );
    const upload = rows[0];
    if (!upload) return new Response("Not found", { status: 404 });

    const file = await getPrivateFile(upload.storage_key);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body, {
      headers: {
        "Content-Type": upload.content_type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return internalError("upload:read", err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  try {
    await ready();
    const { rows } = await pool().query<{ storage_key: string }>(
      `DELETE FROM uploads WHERE id = $1 AND user_id = $2 RETURNING storage_key`,
      [id, session.user.id],
    );
    if (!rows[0]) return new Response("Not found", { status: 404 });
    await deletePrivateFile(rows[0].storage_key).catch(() => {});
    return Response.json({ ok: true });
  } catch (err) {
    return internalError("upload:delete", err);
  }
}
