"use client";

import { TINT_NAME, TINTS, Tint } from "@/lib/types";

const TINT_HEX_SOLID: Record<Tint, string> = {
  natural: "#9C9A93",
  clay: "#C28666",
  rose: "#C26F76",
  mist: "#6E92A6",
  sage: "#7CA086",
  sun: "#C7A961",
  violet: "#9189C7",
};

export function TintPicker({
  value,
  onChange,
}: {
  value: Tint;
  onChange: (t: Tint) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {TINTS.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            onClick={(e) => {
              e.stopPropagation();
              onChange(t);
            }}
            aria-label={TINT_NAME[t]}
            title={TINT_NAME[t]}
            type="button"
            className={`h-4 w-4 rounded-full transition-shadow ${
              active
                ? "ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface)]"
                : "ring-1 ring-[var(--color-border)] hover:ring-[var(--color-muted)]"
            }`}
            style={{ background: TINT_HEX_SOLID[t] }}
          />
        );
      })}
    </div>
  );
}

export { TINT_HEX_SOLID };
