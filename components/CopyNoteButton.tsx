"use client";

import { useState } from "react";

export function CopyNoteButton({
  text,
  contentSelector,
}: {
  text: string;
  contentSelector?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      let content = text;
      if (contentSelector) {
        const el = document.querySelector(contentSelector);
        if (el) content = (el as HTMLElement).innerText;
      }
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked (insecure context, etc.) — silently no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : "Copy note"}
      title={copied ? "Copied" : "Copy note"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
    >
      {copied ? <CheckMark /> : <CopyMark />}
    </button>
  );
}

function CopyMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}
