import { signIn } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entry point for native (iOS) Google sign-in. The app opens this URL in the
// system browser via ASWebAuthenticationSession (Google forbids OAuth in an
// embedded web view), and we kick off the same Google flow the web uses — but
// land back on /native/bridge, which hands the resulting session to the app.
export async function GET(req: Request) {
  const challenge = new URL(req.url).searchParams.get("challenge");
  if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return new Response("Update Keep to complete native sign-in.", { status: 400 });
  }
  await signIn("google", { redirectTo: `/native/bridge?challenge=${challenge}` });
  // signIn throws a redirect to Google; this return is unreachable.
  return new Response(null, { status: 500 });
}
