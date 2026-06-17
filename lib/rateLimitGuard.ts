import { NextResponse } from "next/server";
import { clientIpFromHeaders, type RateLimitDecision } from "@/lib/rateLimit";

type Limiter = (key: string, now?: number) => RateLimitDecision;

/** Build the standard 429 response for a denied rate-limit decision. */
export function rateLimitResponse(decision: RateLimitDecision, message: string) {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(decision.retryAfter),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": String(decision.remaining),
      },
    },
  );
}

/**
 * Apply a per-client-IP rate limit at the top of a route handler. Returns a 429
 * NextResponse when the caller is over budget, or null when the request may
 * proceed — so callers read as `const limited = enforceIpRateLimit(...); if
 * (limited) return limited;`.
 */
export function enforceIpRateLimit(
  limiter: Limiter,
  headers: Headers,
  scope: string,
  message: string,
) {
  const decision = limiter(`${scope}:${clientIpFromHeaders(headers)}`);
  return decision.allowed ? null : rateLimitResponse(decision, message);
}
