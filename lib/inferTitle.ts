const CHECKBOX_PREFIX = /^[-*]\s+\[[ xX]\]\s+/;
const BULLET_PREFIX = /^[-*•]\s+/;
const HEADING_PREFIX = /^#{1,6}\s+/;
const URL_ONLY = /^https?:\/\/\S+$/i;
const CODE_FENCE = /^```/;
const IMAGE_ONLY = /^!\[.*?\]\(.*?\)$/;
const WORD_LIMIT = 4;
const CHAR_LIMIT = 36;

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function cleanLine(line: string) {
  const cleaned = line
    .replace(HEADING_PREFIX, "")
    .replace(CHECKBOX_PREFIX, "")
    .replace(BULLET_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = stripMarkdown(cleaned);
  const inlineChecklist = stripped.search(/\s[-*]\s+\[[ xX]\]\s+/);
  return inlineChecklist > 0 ? stripped.slice(0, inlineChecklist).trim() : stripped;
}

// Titles never carry em/en dashes — swap them for a plain hyphen (the model
// loves an em dash, and they read poorly in the compact sidebar/card titles).
export function stripEmDashes(text: string): string {
  return text.replace(/\s*[—–]\s*/g, " - ").replace(/\s{2,}/g, " ").trim();
}

function trimTitle(title: string) {
  const normalized = stripEmDashes(title);
  const words = normalized.split(/\s+/).filter(Boolean);
  const capped = words.length > WORD_LIMIT ? words.slice(0, WORD_LIMIT).join(" ") : normalized;
  return capped.length > CHAR_LIMIT ? `${capped.slice(0, CHAR_LIMIT - 1).trim()}…` : capped;
}

export function inferNoteTitle(body: string, fallback = "Untitled text") {
  const lines = body
    .split(/\r?\n/)
    .filter((raw) => {
      const t = raw.trim();
      return t.length > 0 && !CODE_FENCE.test(t) && !IMAGE_ONLY.test(t);
    })
    .map(cleanLine)
    .filter((line) => line.length > 0 && !URL_ONLY.test(line));

  if (lines[0]) return trimTitle(lines[0]);

  const compact = cleanLine(body.replace(/\r?\n/g, " "));
  if (compact) return trimTitle(compact);

  return fallback;
}

export function searchableText(note: { body: string; title: string }) {
  return note.body.trim() || note.title.trim();
}

export function previewText(note: { body: string; title: string }) {
  const title = needsInferredTitle(note.title, note.body)
    ? inferNoteTitle(searchableText(note))
    : note.title;
  const text = title.replace(/\s+/g, " ").trim();
  return text || "(empty)";
}

export function needsInferredTitle(title: string, body: string): boolean {
  const compactTitle = title.replace(/\s+/g, " ").trim();
  const compactBody = body.replace(/\s+/g, " ").trim();
  return (
    compactTitle.length === 0 ||
    compactTitle.length > CHAR_LIMIT ||
    compactTitle.split(/\s+/).filter(Boolean).length > WORD_LIMIT ||
    compactTitle === compactBody
  );
}
