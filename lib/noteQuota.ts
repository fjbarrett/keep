import { MAX_NOTE_STORAGE_BYTES, MAX_NOTES_PER_USER } from "./noteLimits";

// A database constraint covers creates, edits, imports, and concurrent requests
// equally. A user over the limit can still shrink or delete existing notes.
export const noteQuotaSql = `
  CREATE OR REPLACE FUNCTION enforce_note_quota() RETURNS trigger AS $$
  DECLARE used_bytes bigint; note_count bigint; new_bytes bigint; old_bytes bigint := 0;
  BEGIN
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('note-quota:' || NEW.user_id, 0));
    IF TG_OP = 'INSERT' AND EXISTS (
      SELECT 1 FROM notes WHERE id = NEW.id AND user_id = NEW.user_id
    ) THEN RETURN NEW; END IF;
    SELECT count(*), COALESCE(sum(octet_length(body) + octet_length(title)
      + octet_length(COALESCE(summary, '')) + octet_length(COALESCE(tags::text, ''))), 0)
      INTO note_count, used_bytes FROM notes WHERE user_id = NEW.user_id AND id <> NEW.id;
    new_bytes := octet_length(NEW.body) + octet_length(NEW.title)
      + octet_length(COALESCE(NEW.summary, '')) + octet_length(COALESCE(NEW.tags::text, ''));
    IF TG_OP = 'UPDATE' AND OLD.user_id = NEW.user_id THEN
      old_bytes := octet_length(OLD.body) + octet_length(OLD.title)
        + octet_length(COALESCE(OLD.summary, '')) + octet_length(COALESCE(OLD.tags::text, ''));
    END IF;
    IF (TG_OP = 'INSERT' AND note_count >= ${MAX_NOTES_PER_USER}) OR
       (used_bytes + new_bytes > ${MAX_NOTE_STORAGE_BYTES} AND new_bytes > old_bytes) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', CONSTRAINT = 'notes_owner_quota',
        MESSAGE = 'Note storage quota exceeded (25 MiB). Export or delete notes to make room.';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS notes_owner_quota ON notes;
  CREATE TRIGGER notes_owner_quota BEFORE INSERT OR UPDATE OF body, title, summary, tags, user_id
    ON notes FOR EACH ROW EXECUTE FUNCTION enforce_note_quota();
`;

export function isNoteQuotaError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "constraint" in error && error.constraint === "notes_owner_quota";
}
