import Image from "next/image";
import { auth, signOut } from "@/auth";
import { Logo } from "./Logo";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="bg-[var(--color-background)]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-baseline gap-2">
          <Logo />
        </a>

        {user ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
            className="flex items-center gap-3"
          >
            {user.image && (
              <Image
                src={user.image}
                alt={user.name ?? "You"}
                width={28}
                height={28}
                className="rounded-full"
              />
            )}
            <span className="hidden text-xs text-[var(--color-muted)] sm:block">
              {user.name ?? user.email}
            </span>
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
              Sign out
            </button>
          </form>
        ) : (
          <a
            href="/signin?from=/"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
