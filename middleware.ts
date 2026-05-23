import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Use an edge-safe slice of the config here — the full auth.ts pulls in pg
// and @simplewebauthn/server, which can't run in the Edge runtime.
const { auth } = NextAuth(authConfig);

// Keep the API private, but allow the app shell to load for guests. Guest notes
// live in localStorage until the user signs in and the client syncs them.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // /p/<token>.txt → /p/<token>/raw.txt — keeps the public-facing URL short
  // and gives the browser a real .txt extension to download against.
  const txt = pathname.match(/^\/p\/([^/]+)\.txt$/);
  if (txt) {
    const url = req.nextUrl.clone();
    url.pathname = `/p/${txt[1]}/raw.txt`;
    return NextResponse.rewrite(url);
  }

  if (req.auth) return;

  if (pathname === "/api/notes/title") return;
  // Passkey sign-in runs before the session exists.
  if (pathname.startsWith("/api/passkeys/auth/")) return;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const config = {
  matcher: ["/((?!signin|api/auth|_next/static|_next/image|favicon).*)"],
};
