import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex w-full max-w-5xl items-baseline justify-between px-6 py-4">
        <a href="/" className="flex items-baseline gap-2">
          <Logo />
          <span className="text-xs text-[var(--color-muted)]">
            personal notes, kept private
          </span>
        </a>
      </div>
    </header>
  );
}
