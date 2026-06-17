import { NextResponse } from "next/server";
import { clientIpFromHeaders, createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";
import { recordAnalyticsEvent } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Page-view beacons are anonymous and fire on navigation, so they're frequent
// but cheap — cap per-IP to stop anyone inflating the counts.
const analyticsRateLimit = createTokenBucketRateLimiter({
  limit: 60,
  windowMs: 60_000,
});

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(
    analyticsRateLimit,
    req.headers,
    "analytics",
    "Too many events.",
  );
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const path = typeof body?.path === "string" ? body.path : "";
  // Malformed beacons are ignored silently — never surface analytics to clients.
  if (!path) return noContent();

  await recordAnalyticsEvent({
    type: "pageview",
    path,
    referrer: typeof body?.referrer === "string" ? body.referrer : null,
    ip: clientIpFromHeaders(req.headers),
    ua: req.headers.get("user-agent") ?? "",
    selfHost: req.headers.get("host") ?? undefined,
    now: Date.now(),
  });
  return noContent();
}
