import { auth } from "@/auth";
import { pool, ready } from "@/lib/db";
import { internalError } from "@/lib/apiError";
import { deletePrivateFile, getPrivateFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadRow = {
  user_id: string;
  storage_key: string;
  content_type: string;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 });

  try {
    await ready();
    const { rows } = await pool().query<UploadRow>(
      `SELECT user_id, storage_key, content_type FROM uploads WHERE id = $1`,
      [id],
    );
    const upload = rows[0];
    if (!upload) return new Response("Not found", { status: 404 });

    const session = await auth();
    let allowed = session?.user?.id === upload.user_id;
    if (!allowed) {
      const token = new URL(req.url).searchParams.get("share") ?? "";
      if (/^[A-Za-z0-9_-]{3,40}$/.test(token)) {
        const reference = `/api/uploads/${id}`;
        const shared = await pool().query(
          `SELECT 1 FROM notes
            WHERE user_id = $1 AND share_token = $2 AND trashed = false
              AND position($3 in body) > 0
            LIMIT 1`,
          [upload.user_id, token, reference],
        );
        allowed = Boolean(shared.rows[0]);
      }
    }
    if (!allowed) return new Response("Not found", { status: 404 });

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
