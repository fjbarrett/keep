import Image from "next/image";
import { auth, signOut } from "@/auth";
import { Logo } from "./Logo";

export async function Header() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="bg-[var(--color-canvas)]">
      <div className="flex w-full items-center gap-4 px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <Logo />
        </a>

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
                width={28}
                height={28}
                className="rounded-full border border-[var(--color-border)]"
              />
            )}
            <span className="hidden text-sm text-[var(--color-muted)] sm:block">
              {user.name ?? user.email}
            </span>
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
            >
              Sign out
            </button>
          </form>
        ) : (
          <a
            href="/signin?from=/"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            Sign in
          </a>
        )}
      </div>
    </header>
  );
}
