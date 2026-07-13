// Abuse caps shared by the create and update note routes. Body and tags are
// otherwise unbounded, which is a storage-exhaustion vector.
export const MAX_NOTE_BODY = 256 * 1024; // 256K UTF-16 chars — generous for a single note
// Byte cap for the JSON request wrapping a note. MAX_NOTE_BODY counts UTF-16
// characters, and one character can JSON-encode to up to 6 UTF-8 bytes
// (\uXXXX); sizing for the worst case keeps large multibyte notes saveable.
export const MAX_NOTE_REQUEST_BYTES = MAX_NOTE_BODY * 6 + 16 * 1024;
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
