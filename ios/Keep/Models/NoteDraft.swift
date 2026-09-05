import Foundation

/// The saved server version stays with the draft so conflicts can be detected
/// after a restart. A new draft keeps its client-generated ID across retries.
struct NoteDraft: Codable, Equatable, Identifiable {
    let id: String
    var body: String
    /// Nil preserves legacy automatic titles; non-nil is an explicitly edited title.
    var title: String?
    var base: Note?
    var revision: Int
    var editedAt = Date().timeIntervalSince1970 * 1000

    var snapshot: Note {
        var note = base ?? Note(id: id, title: NoteTitle.infer(body), body: body,
            pinned: false, archived: false, trashed: false, markdown: false,
            highlight: false, tags: [], createdAt: editedAt, updatedAt: editedAt)
        note.body = body
        if title != nil { note.title = resolvedTitle }
        note.updatedAt = editedAt
        return note
    }

    var resolvedTitle: String {
        guard let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return NoteTitle.infer(body)
        }
        return title
    }

    func matches(_ note: Note) -> Bool {
        body == note.body && (title == nil || resolvedTitle == note.title)
    }

    init(id: String, body: String, base: Note? = nil, revision: Int = 1, title: String? = nil) {
        self.id = id
        self.body = body
        self.title = title
        self.base = base
        self.revision = revision
    }
}
