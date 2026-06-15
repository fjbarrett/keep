import Foundation
import Observation

/// Observable view-model backing the notes UI.
@MainActor
@Observable
final class NotesStore {
    private(set) var notes: [Note] = []
    private(set) var isLoading = false
    var errorMessage: String?

    private let api: KeepAPI

    init(api: KeepAPI = KeepAPI()) {
        self.api = api
    }

    /// Pinned first, then most-recently-updated — matches the web ordering.
    var sorted: [Note] {
        notes
            .filter { !$0.trashed && !$0.archived }
            .sorted { a, b in
                if a.pinned != b.pinned { return a.pinned }
                return a.updatedAt > b.updatedAt
            }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do { notes = try await api.listNotes() }
        catch { errorMessage = error.localizedDescription }
    }

    func create(body: String) async {
        do {
            let note = try await api.create(body: body)
            notes.insert(note, at: 0)
        } catch { errorMessage = error.localizedDescription }
    }

    func update(_ id: String, patch: [String: Any]) async {
        do {
            let updated = try await api.update(id: id, patch: patch)
            if let i = notes.firstIndex(where: { $0.id == id }) { notes[i] = updated }
        } catch { errorMessage = error.localizedDescription }
    }

    func togglePin(_ note: Note) async {
        await update(note.id, patch: ["pinned": !note.pinned])
    }

    func trash(_ note: Note) async {
        do {
            try await api.trash(id: note.id)
            notes.removeAll { $0.id == note.id }
        } catch { errorMessage = error.localizedDescription }
    }
}
