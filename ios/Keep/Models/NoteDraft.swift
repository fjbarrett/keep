import Foundation

/// The saved server version stays with the draft so conflicts can be detected
/// after a restart. A new draft keeps its client-generated ID across retries.
struct NoteDraft: Codable, Equatable, Identifiable {
    let id: String
    var body: String
    var base: Note?
    var revision: Int

    init(id: String, body: String, base: Note? = nil, revision: Int = 1) {
        self.id = id
        self.body = body
        self.base = base
        self.revision = revision
    }
}
