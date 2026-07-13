import Image from "next/image";
import { auth } from "@/auth";
import { isAnalyticsOwner } from "@/lib/analyticsSummary";
import { Logo } from "./Logo";
import { SignOutButton } from "./SignOutButton";

export async function Header() {
  const session = await auth();
  const user = session?.user;
  const owner = isAnalyticsOwner(user?.email);

  return (
    <header className="bg-[var(--color-canvas)]">
      <div className="flex w-full items-center gap-4 px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <Logo />
        </a>

        <div className="flex-1" />

        {user ? (
          <>
            {owner && (
              <a
                href="/analytics"
                className="hidden text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] sm:block"
              >
                Analytics
              </a>
            )}
            <div className="flex items-center gap-3">
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
              <SignOutButton ownerId={user.id} />
            </div>
          </>
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
