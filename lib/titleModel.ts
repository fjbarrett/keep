import { inferNoteTitle } from "./inferTitle";

// Anthropic Haiku is the primary provider for note metadata. One call returns
// both the short title and the one-line card description, so the card grid
// never has to make a request per note.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_INPUT_CHARS = 50_000;

export type NoteMeta = { title: string; summary: string };

/** Cheap, deterministic one-line summary used when no API key is configured. */
function heuristicSummary(body: string): string {
  const text = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*•]\s+(\[[ xX]\]\s+)?/, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join(" ");
  return text.length > 200 ? text.slice(0, 200).trimEnd() + "…" : text;
}

function clean(value: string, max: number) {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Generates a short title and a one-sentence card description in a single
 * Anthropic Haiku call. Falls back to heuristics when the key is missing or
 * the call fails, so callers always get usable metadata.
 */
export async function generateNoteMeta(body: string): Promise<NoteMeta> {
  const fallback: NoteMeta = {
    title: inferNoteTitle(body),
    summary: heuristicSummary(body),
  };
  const apiKey = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !body.trim()) return fallback;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 200,
        system:
          "Return ONLY a JSON object describing a note, with two string fields: " +
          '"title" — 3 to 7 words, no quotes or trailing punctuation; and ' +
          '"summary" — one sentence (max ~160 chars) in active voice describing what the note contains. ' +
          "Output nothing except the JSON object.",
        messages: [
          { role: "user", content: body.slice(0, MAX_INPUT_CHARS) },
          // Prefill an opening brace so the model continues valid JSON.
          { role: "assistant", content: "{" },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const raw = "{" + (data.content?.[0]?.text ?? "");
    const parsed = JSON.parse(raw) as { title?: unknown; summary?: unknown };
    const title = typeof parsed.title === "string" ? clean(parsed.title, 80) : "";
    const summary =
      typeof parsed.summary === "string" ? clean(parsed.summary, 200) : "";
    return {
      title: title || fallback.title,
      summary: summary || fallback.summary,
    };
  } catch {
    return fallback;
  }
}

/** Title-only convenience wrapper kept for callers that don't need the summary. */
export async function generateNoteTitle(body: string): Promise<string> {
  return (await generateNoteMeta(body)).title;
}
