import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignUpForm } from "@/components/SignUpForm";

export const metadata = { referrer: "no-referrer" as const };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={44} />
          <p className="text-sm text-[var(--color-muted)]">{token ? "Choose a password to finish signup." : "Create your Keep account."}</p>
        </div>
        <SignUpForm token={token} />
      </div>
    </main>
  );
}
