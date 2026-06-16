"use client";

import { useEffect, useState } from "react";
import {
  ACCENTS,
  AccentKey,
  applyAccent,
  readStoredAccent,
  storeAccent,
} from "@/lib/accent";

// The rainbow swatch that represents the "multicolor" (default) choice.
const MULTICOLOR_SWATCH =
  "conic-gradient(from 210deg, #f4408c, #f5872b, #e0a30f, #3fb463, #2b60f2, #9a5cf0, #f4408c)";

export function AccentPicker() {
  const [active, setActive] = useState<AccentKey>("multicolor");

  // Read the stored choice after mount to avoid an SSR/client mismatch.
  useEffect(() => setActive(readStoredAccent()), []);

  function pick(key: AccentKey) {
    setActive(key);
    storeAccent(key);
    applyAccent(key);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      {ACCENTS.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={() => pick(a.key)}
          title={a.label}
          aria-label={a.label}
          aria-pressed={active === a.key}
          className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
            active === a.key
              ? "ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface)]"
              : ""
          }`}
          style={{
            background: a.key === "multicolor" ? MULTICOLOR_SWATCH : a.color,
          }}
        />
      ))}
    </div>
  );
}
