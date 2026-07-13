// Abuse caps shared by the create and update note routes. Body and tags are
// otherwise unbounded, which is a storage-exhaustion vector.
export const MAX_NOTE_BODY = 256 * 1024; // 256 KB — generous for a single note
export const MAX_NOTE_TITLE = 120;
export const MAX_NOTE_SUMMARY = 500;
export const MAX_TAGS = 50;
export const MAX_TAG_LEN = 64;
export const MAX_NOTES_PER_USER = 10_000;

/** True when a tags value isn't an array of short strings within the count cap. */
export function tagsInvalid(tags: unknown): boolean {
  return (
    !Array.isArray(tags) ||
    tags.length > MAX_TAGS ||
    tags.some((t) => typeof t !== "string" || t.length > MAX_TAG_LEN)
  );
}
