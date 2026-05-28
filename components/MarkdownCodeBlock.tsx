"use client";

import { useRef, useState, type ComponentProps } from "react";
import { CheckIcon, CopyIcon } from "./Icons";

type Props = ComponentProps<"pre"> & { node?: unknown };

export function MarkdownCodeBlock({ children, node: _node, ...props }: Props) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      const text = ref.current?.innerText.replace(/\n$/, "") ?? "";
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked (insecure context, etc.) — silently no-op.
    }
  }

  return (
    <div className="code-block-group">
      <pre ref={ref} {...props}>
        {children}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
        className="code-block-copy"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
