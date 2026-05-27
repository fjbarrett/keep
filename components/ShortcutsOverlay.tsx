"use client";

import { useEffect } from "react";
import { XIcon } from "@/components/Icons";

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    items: [
      { keys: ["j", "↓"], label: "Next note" },
      { keys: ["k", "↑"], label: "Previous note" },
      { keys: ["Enter", "o"], label: "Open note" },
      { keys: ["Esc"], label: "Close editor" },
    ],
  },
  {
    title: "Actions",
    items: [
      { keys: ["n", "c"], label: "New note" },
      { keys: ["p"], label: "Toggle pin" },
      { keys: ["a"], label: "Toggle archive" },
      { keys: ["Del"], label: "Move to trash" },
    ],
  },
  {
    title: "Global",
    items: [
      { keys: ["⌘K"], label: "Search" },
      { keys: ["/", "f"], label: "Search" },
      { keys: ["?"], label: "Shortcuts" },
      { keys: ["⌘Enter"], label: "Close editor" },
    ],
  },
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close shortcuts"
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-5 p-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-[var(--color-text)]">
                      {item.label}
                    </span>
                    <span className="flex gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-block min-w-[22px] rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 text-center font-mono text-[11px] text-[var(--color-muted)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
