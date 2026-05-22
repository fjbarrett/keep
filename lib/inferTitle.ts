const CHECKBOX_PREFIX = /^[-*]\s+\[[ xX]\]\s+/;
const BULLET_PREFIX = /^[-*•]\s+/;
const URL_ONLY = /^https?:\/\/\S+$/i;
const WORD_LIMIT = 7;
const CHAR_LIMIT = 64;

function cleanLine(line: string) {
  const cleaned = line
    .replace(CHECKBOX_PREFIX, "")
    .replace(BULLET_PREFIX, "")
    .replace(/\s+/g, " ")
    .trim();
  const inlineChecklist = cleaned.search(/\s[-*]\s+\[[ xX]\]\s+/);
  return inlineChecklist > 0 ? cleaned.slice(0, inlineChecklist).trim() : cleaned;
}

function trimTitle(title: string) {
  const words = title.split(/\s+/).filter(Boolean);
  const capped = words.length > WORD_LIMIT ? words.slice(0, WORD_LIMIT).join(" ") : title;
  return capped.length > CHAR_LIMIT ? `${capped.slice(0, CHAR_LIMIT - 1).trim()}…` : capped;
}

export function inferNoteTitle(body: string, fallback = "Untitled note") {
  const lines = body
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length > 0 && !URL_ONLY.test(line));

  if (lines[0]) return trimTitle(lines[0]);

  const compact = cleanLine(body);
  if (compact) return trimTitle(compact);

  return fallback;
}

export function needsInferredTitle(title: string, body: string) {
  const compactTitle = title.replace(/\s+/g, " ").trim();
  const compactBody = body.replace(/\s+/g, " ").trim();
  return (
    compactTitle.length === 0 ||
    compactTitle.length > CHAR_LIMIT ||
    compactTitle.split(/\s+/).filter(Boolean).length > WORD_LIMIT ||
    compactTitle === compactBody
  );
}
