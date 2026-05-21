import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Gate every route except the signin page, the auth API routes, and static
// assets. Unauthenticated users get redirected to /signin; API routes return
// JSON 401 instead so the client can show a useful message.
export default auth((req) => {
  if (req.auth) return;

  const { pathname, origin } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const signin = new URL("/signin", origin);
  if (pathname !== "/") signin.searchParams.set("from", pathname);
  return NextResponse.redirect(signin);
});

export const config = {
  matcher: ["/((?!signin|api/auth|_next/static|_next/image|favicon).*)"],
};
