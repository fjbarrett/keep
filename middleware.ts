import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Keep the API private, but allow the app shell to load for guests. Guest notes
// live in localStorage until the user signs in and the client syncs them.
export default auth((req) => {
  if (req.auth) return;

  const { pathname } = req.nextUrl;
  if (pathname === "/api/notes/title") return;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const config = {
  matcher: ["/((?!signin|api/auth|_next/static|_next/image|favicon).*)"],
};
