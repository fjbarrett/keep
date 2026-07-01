import type { ReactNode } from "react";

// Split text into plain runs and <mark> spans for each match range, for the
// yellow-box overlays behind the plain and syntax editors. The active match
// carries a data attribute so it can be scrolled into view, and a stronger box.
export function renderSearchHits(
  text: string,
  matches: [number, number][],
  active: number,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  matches.forEach(([start, end], i) => {
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <mark
        key={i}
        data-search-active={i === active ? "" : undefined}
        className={i === active ? "search-hit search-hit-active" : "search-hit"}
      >
        {text.slice(start, end)}
      </mark>,
    );
    last = end;
  });
  nodes.push(text.slice(last));
  return nodes;
}
