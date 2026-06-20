import { signIn } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entry point for native (iOS) Google sign-in. The app opens this URL in the
// system browser via ASWebAuthenticationSession (Google forbids OAuth in an
// embedded web view), and we kick off the same Google flow the web uses — but
// land back on /native/bridge, which hands the resulting session to the app.
export async function GET() {
  await signIn("google", { redirectTo: "/native/bridge" });
  // signIn throws a redirect to Google; this return is unreachable.
  return new Response(null, { status: 500 });
}
