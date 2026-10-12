// Maintain references in the same transaction as note edits. The foreign key
// prevents cleanup from deleting an attachment concurrently linked by a note.
export const noteUploadReferencesSql = `
  CREATE TABLE IF NOT EXISTS note_upload_references (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
    PRIMARY KEY (note_id, upload_id)
  );
  CREATE INDEX IF NOT EXISTS note_upload_references_upload_idx ON note_upload_references(upload_id);
  LOCK TABLE notes IN SHARE ROW EXCLUSIVE MODE;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'notes_upload_references_refresh' AND tgrelid = 'notes'::regclass) THEN
      INSERT INTO note_upload_references (note_id, upload_id)
        SELECT DISTINCT n.id, u.id FROM notes n
        CROSS JOIN LATERAL regexp_matches(n.body, '/api/uploads/([0-9a-f]{32})', 'g') AS reference
        JOIN uploads u ON u.id = reference[1] AND u.user_id = n.user_id
        ON CONFLICT DO NOTHING;
    END IF;
  END $$;
  CREATE OR REPLACE FUNCTION refresh_note_upload_references() RETURNS trigger AS $$
  BEGIN
    DELETE FROM note_upload_references WHERE note_id = NEW.id;
    INSERT INTO note_upload_references (note_id, upload_id)
      SELECT DISTINCT NEW.id, u.id
        FROM regexp_matches(NEW.body, '/api/uploads/([0-9a-f]{32})', 'g') AS reference
        JOIN uploads u ON u.id = reference[1] AND u.user_id = NEW.user_id
      ON CONFLICT DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS notes_upload_references_refresh ON notes;
  CREATE TRIGGER notes_upload_references_refresh AFTER INSERT OR UPDATE OF body, user_id
    ON notes FOR EACH ROW EXECUTE FUNCTION refresh_note_upload_references();
`;
