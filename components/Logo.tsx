export function Logo({ size = 22 }: { size?: number }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={size} height={size} className="rounded-[5px]" />
      <span
        className="font-semibold tracking-tight text-[var(--color-text)]"
        style={{ fontSize: Math.round(size * 0.9) }}
      >
        Keep
      </span>
    </>
  );
}
