import { NextResponse } from "next/server";
import {
  clientIpFromHeaders,
  createTokenBucketRateLimiter,
} from "@/lib/rateLimit";
import { generateNoteMeta } from "@/lib/titleModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLE_BODY_CHARS = 8 * 1024;
const MAX_TITLE_REQUEST_BYTES = 16 * 1024;
const titleRateLimit = createTokenBucketRateLimiter({
  limit: 12,
  windowMs: 60_000,
});

export async function POST(req: Request) {
  const rateLimit = titleRateLimit(
    `notes-title:${clientIpFromHeaders(req.headers)}`,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many title requests. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfter),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    );
  }

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Title generation failed" },
      { status: 500 },
    );
  }
}
