import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteAuthenticator } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const removed = await deleteAuthenticator(params.id, userId);
  if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
