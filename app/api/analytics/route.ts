import { NextResponse } from "next/server";
import { clientIpFromHeaders, createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { recordAnalyticsEvent } from "@/lib/analytics";
import { readJsonBody, requestBodyError } from "@/lib/requestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Page-view beacons are anonymous and fire on navigation, so they're frequent
// but cheap — cap per-IP to stop anyone inflating the counts.
const analyticsRateLimit = createTokenBucketRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

const noContent = () => new NextResponse(null, { status: 204 });
const MAX_ANALYTICS_BODY = 4 * 1024;

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(
    analyticsRateLimit,
    req.headers,
    "analytics",
    "Too many events.",
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_ANALYTICS_BODY);
  } catch (err) {
    const tooLarge = requestBodyError(err);
    if (tooLarge) return tooLarge;
    body = null;
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  const path = typeof input?.path === "string" ? input.path : "";
  // Malformed beacons are ignored silently — never surface analytics to clients.
  if (!path) return noContent();

  await recordAnalyticsEvent({
    type: "pageview",
    path,
    referrer: typeof input?.referrer === "string" ? input.referrer : null,
    ip: clientIpFromHeaders(req.headers),
    ua: req.headers.get("user-agent") ?? "",
    selfHost: req.headers.get("host") ?? undefined,
    now: Date.now(),
  });
  return noContent();
}
