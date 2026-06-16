export function Logo({ size = 22 }: { size?: number }) {
  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className="rounded-[5px]"
        role="img"
        aria-label="Keep"
      >
        <rect width="64" height="64" rx="14" fill="var(--color-accent)" />
        <rect x="20" y="19" width="24" height="26" rx="2" stroke="#fff" strokeWidth="3" fill="none" />
        <rect x="30" y="19" width="14" height="9" rx="1" fill="#fff" />
        <rect x="22" y="31" width="20" height="12" rx="1" stroke="#fff" strokeWidth="2.5" fill="none" />
      </svg>
      <span
        className="font-semibold tracking-tight text-[var(--color-text)]"
        style={{ fontSize: Math.round(size * 0.9) }}
      >
        Keep
      </span>
    </>
  );
}
