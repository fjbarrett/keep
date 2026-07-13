import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { createTokenBucketRateLimiter } from "@/lib/rateLimit";
import { enforceIpRateLimit } from "@/lib/rateLimitGuard";

// Use a DB-free slice of the config here so request interception stays cheap.
const { auth } = NextAuth(authConfig);

// Per-request Content-Security-Policy. script-src is locked to a fresh nonce
// (plus 'strict-dynamic', so the nonce'd Next.js bootstrap can load its own
// chunks) — there is no 'unsafe-inline', so an injected <script> can't run.
// 'wasm-unsafe-eval' lets Shiki compile its oniguruma WASM (the syntax
// highlighter needs it); it permits WebAssembly only, not arbitrary eval().
// style-src keeps 'unsafe-inline' because Next and the app set inline style
// attributes with no nonce hook; the XSS leverage there is far lower.
//
// Dev-only relaxations: `next dev` evaluates modules with eval() and hot-reloads
// over a websocket, so without 'unsafe-eval' / ws: the client never hydrates and
// nothing interactive works locally. Both are gated to development; production
// stays strict.
const isDev = process.env.NODE_ENV !== "production";
const publicShareRateLimit = createTokenBucketRateLimiter({
  limit: 120,
  windowMs: 60_000,
});

// Cross-origin mutation gate. Sec-Fetch-Site is browser-asserted and
// authoritative when present; the Origin comparison is only a fallback for
// older browsers. req.nextUrl.origin alone is the wrong reference — under
// self-hosted `next start` behind Caddy it is the *listen* origin
// (https://localhost:3000), so comparing the public Origin header against it
// would 403 every same-origin mutation in production.
function allowedOrigins(req: NextRequest): Set<string> {
  const origins = new Set([req.nextUrl.origin]);
  if (process.env.AUTH_URL) {
    try {
      origins.add(new URL(process.env.AUTH_URL).origin);
    } catch {
      // Malformed AUTH_URL — the forwarded-host fallback below still applies.
    }
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
      req.nextUrl.protocol.replace(":", "");
    origins.add(`${proto}://${host}`);
  }
  return origins;
}

function isCrossOriginMutation(req: NextRequest): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none";
  const origin = req.headers.get("origin");
  return origin !== null && !allowedOrigins(req).has(origin);
}

// Note bodies saved before uploads went private embed absolute URLs on the old
// public bucket/CDN origin; keep exactly that origin renderable so those notes
// don't break. New uploads stream same-origin via /api/uploads/<id>.
const legacyImageOrigins = [
  ...new Set(
    [process.env.S3_PUBLIC_BASE_URL, process.env.S3_ENDPOINT]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => {
        try {
          return [new URL(value).origin];
        } catch {
          return [];
        }
      }),
  ),
].join(" ");

function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    // Same-origin worker for client-side PDF text extraction (pdfjs). An explicit
    // worker-src is needed because script-src's 'strict-dynamic' otherwise
    // ignores 'self' for the worker script.
    `worker-src 'self' blob:`,
    // Uploaded images now stream through the authenticated same-origin route.
    // Blocking arbitrary remote images also blocks markdown tracking pixels.
    `img-src 'self' data: blob:${legacyImageOrigins ? ` ${legacyImageOrigins}` : ""}`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
  ].join("; ");
}

// Continue the request with a CSP nonce that both the browser (response header)
// and the renderer (request header → read in app/layout.tsx, and consumed by
// Next.js to nonce its own scripts) can see. Follows the Next.js CSP recipe.
function withCsp(requestHeaders: Headers): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const headers = new Headers(requestHeaders);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Keep the API private, but allow the app shell to load for guests. Guest notes
// live in localStorage until the user signs in and the client syncs them.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && isCrossOriginMutation(req)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  if (pathname.startsWith("/p/")) {
    const limited = enforceIpRateLimit(
      publicShareRateLimit,
      req.headers,
      "public-share",
      "Too many shared-note requests. Try again shortly.",
    );
    if (limited) return limited;
  }

  // /p/<token>.<ext> → /p/<token>/raw.txt — keeps the public-facing URL short
  // and lets the browser download against the extension Keep detected (.py,
  // .md, …), not just .txt. Share tokens never contain a dot, so a dotted
  // suffix here is always the download extension.
  const raw = pathname.match(/^\/p\/([^/]+)\.[A-Za-z0-9]+$/);
  if (raw) {
    const url = req.nextUrl.clone();
    url.pathname = `/p/${raw[1]}/raw.txt`;
    return NextResponse.rewrite(url);
  }

  if (pathname.startsWith("/api/")) {
    // Anonymous endpoints: page-view beacons and the one-time native sign-in
    // exchange. Title inference is authenticated so public traffic cannot spend
    // the model budget or send arbitrary text to the provider.
    const publicApi =
      pathname === "/api/analytics" ||
      pathname === "/api/native/exchange" ||
      (req.method === "GET" && pathname.startsWith("/api/uploads/"));
    if (!req.auth && !publicApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return; // API responses render no HTML, so they need no CSP nonce.
  }

  // HTML routes (including guests on the app shell) get the nonce'd CSP.
  return withCsp(req.headers);
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon).*)"],
};
