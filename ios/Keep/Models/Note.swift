import Foundation

/// Mirrors the web app's `Note` type (lib/types.ts). Timestamps arrive as
/// epoch-millisecond numbers from the JSON API.
struct Note: Identifiable, Codable, Equatable {
    let id: String
    var title: String
    var summary: String?
    var color: String?
    var body: String
    var pinned: Bool
    var archived: Bool
    var trashed: Bool
    var markdown: Bool
    var highlight: Bool
    var tags: [String]
    var shareToken: String?
    var createdAt: Double
    var updatedAt: Double

    var updatedDate: Date { Date(timeIntervalSince1970: updatedAt / 1000) }

    /// First non-empty line, used as a display title when `title` is empty.
    var displayTitle: String {
        if !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return title }
        let firstLine = body.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
        return firstLine.isEmpty ? "Untitled note" : firstLine
    }
}

/// Server envelopes.
struct NotesResponse: Codable { let notes: [Note] }
struct NoteResponse: Codable { let note: Note }
