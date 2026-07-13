import { auth } from "@/auth";
import { pool, ready } from "@/lib/db";
import { internalError } from "@/lib/apiError";
import { recordSecurityEvent } from "@/lib/audit";
import { isSameOriginMutation } from "@/lib/appUrl";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSameOriginMutation(req)) {
    return Response.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ready();
    await pool().query(
      `UPDATE users SET session_version = session_version + 1, updated_at = $1 WHERE id = $2`,
      [Date.now(), session.user.id],
    );
    void recordSecurityEvent("session.revoke", {
      userId: session.user.id,
      headers: req.headers,
      meta: { scope: "all" },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return internalError("auth:revoke", err);
  }
}
