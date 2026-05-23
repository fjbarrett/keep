import { inferNoteTitle } from "./inferTitle";

const DEFAULT_TITLE_MODEL = "gpt-4.1-nano";
const MAX_TITLE_INPUT_CHARS = 50_000;

function cleanTitle(value: string) {
  return value
    .replace(/^["'`]+|["'`.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function generateNoteTitle(body: string) {
  const fallback = inferNoteTitle(body);
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!apiKey || !body.trim()) return fallback;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TITLE_MODEL || DEFAULT_TITLE_MODEL,
        temperature: 0.1,
        max_tokens: 16,
        messages: [
          {
            role: "system",
            content:
              "Summarize the note in a short title. Return only the title, 3 to 7 words. No quotes. No trailing punctuation.",
          },
          {
            role: "user",
            content: body.slice(0, MAX_TITLE_INPUT_CHARS),
          },
        ],
      }),
    });

    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const title = cleanTitle(data.choices?.[0]?.message?.content ?? "");
    return title || fallback;
  } catch {
    return fallback;
  }
}
