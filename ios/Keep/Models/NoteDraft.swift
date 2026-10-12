import Foundation

/// The saved server version stays with the draft so conflicts can be detected
/// after a restart. A new draft keeps its client-generated ID across retries.
struct NoteDraft: Codable, Equatable, Identifiable {
    let id: String
    var body: String
    /// Nil preserves legacy automatic titles; non-nil is an explicitly edited title.
    var title: String?
    /// Nil leaves color unchanged; an empty string explicitly removes it.
    var color: String?
    var base: Note?
    var revision: Int
    var editedAt = Date().timeIntervalSince1970 * 1000

    var snapshot: Note {
        var note = base ?? Note(id: id, title: NoteTitle.infer(body), body: body,
            pinned: false, archived: false, trashed: false, markdown: false,
            highlight: false, tags: [], createdAt: editedAt, updatedAt: editedAt)
        note.body = body
        if title != nil { note.title = resolvedTitle }
        note.color = resolvedColor
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
            && (color == nil || resolvedColor == note.color)
    }

    var resolvedColor: String? {
        guard let color else { return base?.color }
        return color.isEmpty ? nil : color
    }

    init(id: String, body: String, base: Note? = nil, revision: Int = 1, title: String? = nil, color: String? = nil) {
        self.id = id
        self.body = body
        self.title = title
        self.color = color
        self.base = base
        self.revision = revision
    }

    private enum CodingKeys: String, CodingKey { case id, body, title, color, base, revision, editedAt }

    /// A draft journaled before edit times were recorded counts as just edited,
    /// so it surfaces at the top of the list instead of failing to load.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        body = try container.decode(String.self, forKey: .body)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        color = try container.decodeIfPresent(String.self, forKey: .color)
        base = try container.decodeIfPresent(Note.self, forKey: .base)
        revision = try container.decode(Int.self, forKey: .revision)
        if let editedAt = try container.decodeIfPresent(Double.self, forKey: .editedAt) {
            self.editedAt = editedAt
        }
    }
}
