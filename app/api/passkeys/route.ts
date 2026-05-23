import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAuthenticators, toPublic } from "@/lib/passkeys";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await listAuthenticators(userId);
  return NextResponse.json({ passkeys: rows.map(toPublic) });
}
