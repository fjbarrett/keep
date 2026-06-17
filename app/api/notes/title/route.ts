import { NextResponse } from "next/server";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { generateNoteMeta } from "@/lib/titleModel";
import { internalError } from "@/lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLE_BODY_CHARS = 8 * 1024;
const MAX_TITLE_REQUEST_BYTES = 16 * 1024;
const titleRateLimit = createTokenBucketRateLimiter({
  limit: 12,
  windowMs: 60_000,
});

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(
    titleRateLimit,
    req.headers,
    "notes-title",
    "Too many title requests. Try again shortly.",
  );
  if (limited) return limited;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_TITLE_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Note body is too large for title generation." },
      { status: 413 },
    );
  }

  try {
    const body = await req.json();
    const noteBody = String(body.body ?? "");
    if (noteBody.length > MAX_TITLE_BODY_CHARS) {
      return NextResponse.json(
        { error: "Note body is too large for title generation." },
        { status: 413 },
      );
    }
    return NextResponse.json(await generateNoteMeta(noteBody));
  } catch (err) {
    return internalError("notes:title", err);
  }
}
