import Foundation

/// The saved server version stays with the draft so conflicts can be detected
/// after a restart. A new draft keeps its client-generated ID across retries.
struct NoteDraft: Codable, Equatable, Identifiable {
    let id: String
    var body: String
    var base: Note?
    var revision: Int
    var editedAt = Date().timeIntervalSince1970 * 1000

    var snapshot: Note {
        var note = base ?? Note(id: id, title: NoteTitle.infer(body), body: body,
            pinned: false, archived: false, trashed: false, markdown: false,
            highlight: false, tags: [], createdAt: editedAt, updatedAt: editedAt)
        note.body = body
        note.updatedAt = editedAt
        return note
    }

    init(id: String, body: String, base: Note? = nil, revision: Int = 1) {
        self.id = id
        self.body = body
        self.base = base
        self.revision = revision
    }
}
