import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Use an edge-safe slice of the config here — the full auth.ts pulls in pg
// and @simplewebauthn/server, which can't run in the Edge runtime.
const { auth } = NextAuth(authConfig);

// Per-request Content-Security-Policy. script-src is locked to a fresh nonce
// (plus 'strict-dynamic', so the nonce'd Next.js bootstrap can load its own
// chunks) — there is no 'unsafe-inline', so an injected <script> can't run.
// style-src keeps 'unsafe-inline' because Next and the app set inline style
// attributes with no nonce hook; the XSS leverage there is far lower.
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    // data: favicon + pasted images, blob: object URLs, https: uploaded and
    // markdown-referenced images (served from the storage origin / anywhere).
    `img-src 'self' data: blob: https:`,
    `font-src 'self'`,
    `connect-src 'self'`,
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
    // Anonymous endpoints: page-view beacons, title inference, and passkey
    // sign-in (which runs before a session exists). Everything else is private.
    const publicApi =
      pathname === "/api/notes/title" ||
      pathname === "/api/analytics" ||
      pathname.startsWith("/api/passkeys/auth/");
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
