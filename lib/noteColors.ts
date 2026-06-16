// Per-note color labels. They share the app's accent palette so a note's color
// is drawn from the exact same set as the theme accent picker (see lib/accent).
import { ACCENTS } from "./accent";

export type NoteColorKey =
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "graphite";

export const NOTE_COLORS: { key: NoteColorKey; label: string; color: string }[] =
  // "multicolor" is the default accent, not a selectable note label.
  ACCENTS.filter((a) => a.key !== "multicolor").map((a) => ({
    key: a.key as NoteColorKey,
    label: a.label,
    color: a.color,
  }));

/** The note's dot/swatch color, or null when uncolored. */
export function noteColorVar(key?: string | null): string | null {
  return NOTE_COLORS.find((c) => c.key === key)?.color ?? null;
}

const NOTE_COLOR_KEYS = new Set<string>(NOTE_COLORS.map((c) => c.key));

/** True when `value` is a known palette color key. */
export function isNoteColor(value: unknown): value is NoteColorKey {
  return typeof value === "string" && NOTE_COLOR_KEYS.has(value);
}
