"use client";

import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";

type MarkdownModule = {
  default: React.ComponentType<
    ComponentProps<"div"> & {
      children: string;
      remarkPlugins?: unknown[];
      components?: unknown;
    }
  >;
};
type RemarkGfmModule = { default: unknown };

let cachedMarkdown: MarkdownModule | null = null;
let cachedGfm: RemarkGfmModule | null = null;

export function MarkdownPreview({ body }: { body: string }) {
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

  return (
    <div className="prose-invert-auto min-h-[320px] w-full max-w-3xl flex-1 overflow-y-auto px-6 text-base md:text-sm leading-relaxed">
      <Markdown remarkPlugins={[gfm]} components={{ pre: MarkdownCodeBlock }}>
        {body}
      </Markdown>
    </div>
  );
}
