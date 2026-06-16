import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PasskeySignIn } from "@/components/PasskeySignIn";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  const session = await auth();
  if (session?.user) redirect(searchParams.from ?? "/");

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={44} />
          <p className="text-sm text-[var(--color-muted)]">
            Sign in to keep your text.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: searchParams.from ?? "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] shadow-sm hover:bg-[var(--color-surface-hover)]"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>
        <div className="relative my-5 flex items-center">
          <div className="flex-1 border-t border-[var(--color-border)]" />
          <span className="px-3 text-xs text-[var(--color-muted)]">or</span>
          <div className="flex-1 border-t border-[var(--color-border)]" />
        </div>
        <PasskeySignIn redirectTo={searchParams.from ?? "/"} />
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
