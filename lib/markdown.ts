// Cheap heuristic: a body counts as Markdown when it contains any of the
// common block- or inline-level markers. Plain prose with single line breaks
// still renders verbatim — Markdown would otherwise eat soft breaks.
const MARKERS: RegExp[] = [
  /(^|\n)\s{0,3}#{1,6}\s+/,        // headings
  /(^|\n)\s{0,3}[-*+]\s+/,         // bullets
  /(^|\n)\s{0,3}\d+\.\s+/,         // ordered list
  /(^|\n)\s{0,3}>\s+/,             // blockquote
  /(^|\n)\s{0,3}```/,              // fenced code
  /(^|\n)\s{0,3}---+\s*(\n|$)/,    // horizontal rule
  /\*\*[^*\n]+\*\*/,               // bold
  /(^|[^*])\*[^*\n]+\*(?!\*)/,     // italic *…*
  /(^|[^_])_[^_\n]+_(?![_])/,      // italic _…_
  /\[[^\]\n]+\]\([^)\n]+\)/,       // links
  /`[^`\n]+`/,                     // inline code
];

export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  return MARKERS.some((rx) => rx.test(text));
}
