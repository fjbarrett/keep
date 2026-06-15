"use client";

import { NOTE_COLORS } from "@/lib/noteColors";

export function ColorSwatchRow({
  selected,
  onPick,
}: {
  selected: string | null;
  onPick: (color: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <button
        type="button"
        aria-label="No color"
        title="No color"
        onClick={() => onPick(null)}
        className={`grid h-4 w-4 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)] ${
          selected === null
            ? "ring-2 ring-[var(--color-text)] ring-offset-1 ring-offset-[var(--color-surface)]"
            : ""
        }`}
      >
        <span className="text-[9px] leading-none">/</span>
      </button>
      {NOTE_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-label={c.label}
          title={c.label}
          onClick={() => onPick(c.key)}
          style={{ background: `var(${c.var})` }}
          className={`h-4 w-4 rounded-full transition-transform hover:scale-110 ${
            selected === c.key
              ? "ring-2 ring-[var(--color-text)] ring-offset-1 ring-offset-[var(--color-surface)]"
              : ""
          }`}
        />
      ))}
    </div>
  );
}
