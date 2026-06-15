import { NextResponse } from "next/server";
import { generateNoteMeta } from "@/lib/titleModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const noteBody = String(body.body ?? "");
    return NextResponse.json(await generateNoteMeta(noteBody));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Title generation failed" },
      { status: 500 },
    );
  }
}
