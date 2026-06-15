// Per-note color labels. Keys are stored on the note; the swatch/dot color is
// pulled from the brand palette CSS variables so it tracks the theme.
export type NoteColorKey =
  | "blue"
  | "pink"
  | "green"
  | "orange"
  | "purple"
  | "red";

export const NOTE_COLORS: { key: NoteColorKey; label: string; var: string }[] = [
  { key: "blue", label: "Blue", var: "--color-accent" },
  { key: "pink", label: "Pink", var: "--color-pink" },
  { key: "green", label: "Green", var: "--color-green" },
  { key: "orange", label: "Orange", var: "--color-orange" },
  { key: "purple", label: "Purple", var: "--color-done" },
  { key: "red", label: "Red", var: "--color-danger" },
];

/** CSS var() expression for a note's color dot, or null when uncolored. */
export function noteColorVar(key?: string | null): string | null {
  const found = NOTE_COLORS.find((c) => c.key === key);
  return found ? `var(${found.var})` : null;
}
