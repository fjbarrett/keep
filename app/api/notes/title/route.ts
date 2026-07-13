import { NextResponse } from "next/server";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { generateNoteMeta } from "@/lib/titleModel";
import { internalError } from "@/lib/apiError";
import { auth } from "@/auth";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";
import { rateLimitResponse } from "@/lib/rateLimitGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TITLE_BODY_CHARS = 8 * 1024;
const MAX_TITLE_REQUEST_BYTES = 16 * 1024;
const titleRateLimit = createTokenBucketRateLimiter({
  limit: 12,
  windowMs: 60_000,
});
const titleAccountRateLimit = createTokenBucketRateLimiter({
  limit: 30,
  windowMs: 60 * 60_000,
});
const titleGlobalRateLimit = createTokenBucketRateLimiter({
  limit: 300,
  windowMs: 60 * 60_000,
  maxEntries: 1,
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = enforceIpRateLimit(
    titleRateLimit,
    req.headers,
    "notes-title",
    "Too many title requests. Try again shortly.",
  );
  if (limited) return limited;
  const accountDecision = titleAccountRateLimit(`notes-title:${session.user.id}`);
  if (!accountDecision.allowed) {
    return rateLimitResponse(accountDecision, "Title generation quota exceeded. Try again later.");
  }
  const globalDecision = titleGlobalRateLimit("notes-title:global");
  if (!globalDecision.allowed) {
    return rateLimitResponse(globalDecision, "Title generation is temporarily unavailable.");
  }

  try {
    const body = await readJsonBody(req, MAX_TITLE_REQUEST_BYTES);
    const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
    const noteBody = String(input?.body ?? "");
    if (noteBody.length > MAX_TITLE_BODY_CHARS) {
      return NextResponse.json(
        { error: "Note body is too large for title generation." },
        { status: 413 },
      );
    }
    return NextResponse.json(await generateNoteMeta(noteBody));
  } catch (err) {
    const tooLarge = requestBodyError(err, "Note body is too large for title generation.");
    if (tooLarge) return tooLarge;
    return internalError("notes:title", err);
  }
}
