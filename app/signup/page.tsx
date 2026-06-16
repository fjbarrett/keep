import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { SignUpForm } from "@/components/SignUpForm";

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={44} />
          <p className="text-sm text-[var(--color-muted)]">Create your Keep account.</p>
        </div>
        <SignUpForm />
      </div>
    </main>
  );
}
