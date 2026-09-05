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

    var accessibilityState: String {
        [pinned ? "Pinned" : nil, archived ? "Archived" : nil,
         trashed ? "In Trash" : nil, shareToken != nil ? "Shared by link" : nil,
         color.map { "Color: " + $0 }].compactMap { $0 }.joined(separator: ", ")
    }

    var updatedDate: Date { Date(timeIntervalSince1970: updatedAt / 1000) }

    /// Keep authored titles; infer from the body only when a title is missing.
    var displayTitle: String {
        NoteTitle.preview(title: title, body: body)
    }

    /// Card caption, or nil when there's nothing readable to show.
    var displaySummary: String? {
        guard let summary, !summary.isEmpty else { return nil }
        return summary
    }
}

/// Server envelopes.
struct NotesResponse: Codable { let notes: [Note] }
struct NoteResponse: Codable { let note: Note }
struct OkResponse: Codable { let ok: Bool }
/// POST /api/notes/title — model-generated (or heuristic) note metadata.
struct NoteMeta: Codable {
    let title: String
    let summary: String?
}
