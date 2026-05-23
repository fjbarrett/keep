import Image from "next/image";
import { auth, signOut } from "@/auth";
import { Logo } from "./Logo";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-canvas)]">
      <div className="mx-auto flex w-full max-w-[1280px] items-center gap-4 px-4 py-2.5 sm:px-6">
        <a href="/" className="flex items-center gap-2">
          <Logo />
        </a>

        <nav className="hidden items-center gap-1 text-sm text-[var(--color-text)] md:flex">
          <span className="rounded-md px-2.5 py-1 text-sm font-semibold">
            Dashboard
          </span>
        </nav>

        <div className="flex-1" />

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
                width={24}
                height={24}
                className="rounded-full border border-[var(--color-border)]"
              />
            )}
            <span className="hidden text-xs text-[var(--color-muted)] sm:block">
              {user.name ?? user.email}
            </span>
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              Sign out
            </button>
          </form>
        ) : (
          <a
            href="/signin?from=/"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
