import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

// Truncate very long notes before sending to keep latency and cost low
const MAX_LEN = 2000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Not configured" }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.oldBody !== "string" || typeof body?.newBody !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const oldText = (body.oldBody as string).slice(0, MAX_LEN);
  const newText = (body.newBody as string).slice(0, MAX_LEN);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system:
        "Describe what changed between two versions of a note in one concise sentence. Active voice, specific, no filler phrases like 'the note was updated'. Example: 'Added a three-item action list and moved the deadline to Friday.'",
      messages: [
        {
          role: "user",
          content: `Before:\n${oldText}\n\nAfter:\n${newText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "API error" }, { status: 502 });
  }

  const data = await res.json();
  const description: string = data.content?.[0]?.text?.trim() ?? "Unable to describe changes.";
  return NextResponse.json({ description });
}
