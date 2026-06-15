export function Logo() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={22} height={22} className="rounded-[5px]" />
      <span className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
        Keep
      </span>
    </>
  );
}
