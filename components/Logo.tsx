export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[var(--color-text)]">
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        width={32}
        height={32}
        fill="currentColor"
      >
        <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25Z" />
        <path d="M4 4h8v1.5H4Zm0 3h8v1.5H4Zm0 3h5v1.5H4Z" />
      </svg>
      <span className="text-sm font-semibold tracking-tight">Keep</span>
    </span>
  );
}
