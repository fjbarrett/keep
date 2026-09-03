import { inferNoteTitle, needsInferredTitle } from "@/lib/inferTitle";
import { Note } from "@/lib/types";

const GUEST_NOTES_KEY = "keep.guestNotes.v1";

export function localNoteId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function readGuestNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStoredNote).filter((note): note is Note => Boolean(note));
  } catch {
    return [];
  }
}

function normalizeStoredNote(value: unknown): Note | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Note;
  const body = String(note.body ?? "");
  const title = String(note.title ?? "");
  return {
    ...note,
    title: needsInferredTitle(title, body) ? inferNoteTitle(body || title) : title,
    body,
    trashed: Boolean(note.trashed),
    markdown: Boolean(note.markdown),
    highlight: Boolean(note.highlight),
    tags: Array.isArray(note.tags) ? note.tags : [],
    shareToken: note.shareToken ?? null,
  };
}

export function writeGuestNotes(notes: Note[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_NOTES_KEY, JSON.stringify(notes));
}

export function clearGuestNotes() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GUEST_NOTES_KEY);
}

export async function notesApi<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.json
      ? { "Content-Type": "application/json", ...(init?.headers ?? {}) }
      : init?.headers,
    body: init?.json ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
    keepalive: init?.keepalive,
  });
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // Keep the HTTP status when an error response is not JSON.
    }
    throw new NotesApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export class NotesApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function isRetryableNoteError(error: unknown) {
  return (
    !(error instanceof NotesApiError) ||
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500
  );
}

export function firstNoteLine(body: string) {
  return body.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

export async function metadataForBody(
  body: string,
): Promise<{ title: string; summary: string }> {
  try {
    const data = await notesApi<{ title: string; summary?: string }>("/api/notes/title", {
      method: "POST",
      json: { body },
    });
    return {
      title: data.title || inferNoteTitle(body),
      summary: data.summary ?? "",
    };
  } catch {
    return { title: inferNoteTitle(body), summary: "" };
  }
}
