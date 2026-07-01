"use client";

import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";

type MarkdownModule = {
  default: React.ComponentType<
    ComponentProps<"div"> & {
      children: string;
      remarkPlugins?: unknown[];
      rehypePlugins?: unknown[];
      components?: unknown;
    }
  >;
};
type RemarkGfmModule = { default: unknown };

let cachedMarkdown: MarkdownModule | null = null;
let cachedGfm: RemarkGfmModule | null = null;

// A rehype transform that wraps every case-insensitive match of `query` in a
// <mark> so search hits show the same yellow box the editors use. The Nth match
// (document order) gets the active styling + data attribute, so the editor's
// scroll-to-active effect finds it and preview stays in step with the editor.
function rehypeHighlightMatches(query: string, activeMatch: number) {
  const q = query.toLowerCase();
  return () => (tree: unknown) => {
    let count = 0;
    const walk = (node: { children?: unknown[] }) => {
      if (!Array.isArray(node.children)) return;
      const next: unknown[] = [];
      for (const child of node.children as {
        type: string;
        value?: string;
        children?: unknown[];
      }[]) {
        if (child.type === "text" && child.value) {
          const text = child.value;
          const lower = text.toLowerCase();
          let i = lower.indexOf(q);
          if (i === -1) {
            next.push(child);
            continue;
          }
          let last = 0;
          while (i !== -1) {
            if (i > last) next.push({ type: "text", value: text.slice(last, i) });
            const active = count === activeMatch;
            next.push({
              type: "element",
              tagName: "mark",
              properties: {
                className: active
                  ? ["search-hit", "search-hit-active"]
                  : ["search-hit"],
                ...(active ? { dataSearchActive: "" } : {}),
              },
              children: [{ type: "text", value: text.slice(i, i + q.length) }],
            });
            count += 1;
            last = i + q.length;
            i = lower.indexOf(q, last);
          }
          if (last < text.length) next.push({ type: "text", value: text.slice(last) });
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree as { children?: unknown[] });
  };
}

export function MarkdownPreview({
  body,
  query,
  activeMatch = 0,
}: {
  body: string;
  query?: string | null;
  activeMatch?: number;
}) {
  const [modules, setModules] = useState<{ Md: MarkdownModule; gfm: RemarkGfmModule } | null>(
    cachedMarkdown && cachedGfm ? { Md: cachedMarkdown, gfm: cachedGfm } : null,
  );

  useEffect(() => {
    if (modules) return;
    Promise.all([
      import("react-markdown") as Promise<MarkdownModule>,
      import("remark-gfm") as Promise<RemarkGfmModule>,
    ]).then(([Md, gfm]) => {
      cachedMarkdown = Md;
      cachedGfm = gfm;
      setModules({ Md, gfm });
    });
  }, [modules]);

  if (!modules) {
    return (
      <div className="flex-1 animate-pulse px-1 py-2 text-sm text-[var(--color-muted)]">
        Loading preview...
      </div>
    );
  }

  const Markdown = modules.Md.default;
  const gfm = modules.gfm.default;
  const trimmed = query?.trim();
  const rehypePlugins = trimmed
    ? [rehypeHighlightMatches(trimmed, activeMatch)]
    : [];

  return (
    <div className="prose-invert-auto mx-auto min-h-[320px] w-full max-w-3xl xl:max-w-4xl flex-1 overflow-y-auto px-6 text-[15px] leading-relaxed">
      <Markdown
        remarkPlugins={[gfm]}
        rehypePlugins={rehypePlugins}
        components={{ pre: MarkdownCodeBlock }}
      >
        {body}
      </Markdown>
    </div>
  );
}
