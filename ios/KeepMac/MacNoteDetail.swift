import SwiftUI

/// The editor pane. Autosaves the body (debounced ~0.6s, like the web), and a
/// new note (`note == nil`) is created on first non-empty save then patched —
/// mirroring the web/iOS create→edit bridge. Pin / archive / trash live in the
/// toolbar.
struct MacNoteDetail: View {
    @Environment(NotesStore.self) private var store

    let note: Note?
    var onCreated: (String) -> Void = { _ in }

    @State private var text = ""
    @State private var createdId: String?
    @State private var saveTask: Task<Void, Never>?

    /// The live note (existing, or the one we just created), pulled fresh from
    /// the store so toolbar state (pin/archive) reflects the latest.
    private var current: Note? {
        if let note { return store.notes.first { $0.id == note.id } ?? note }
        if let createdId { return store.notes.first { $0.id == createdId } }
        return nil
    }

    var body: some View {
        TextEditor(text: $text)
            .font(.body)
            .textEditorStyle(.plain)
            .scrollContentBackground(.hidden)
            .padding(12)
            .navigationTitle(current?.displayTitle ?? "New Note")
            .onAppear { text = note?.body ?? "" }
            .onChange(of: text) { _, value in scheduleSave(value) }
            .toolbar {
                if let n = current {
                    ToolbarItemGroup {
                        Button {
                            Task { await store.togglePin(n) }
                        } label: {
                            Label(n.pinned ? "Unpin" : "Pin",
                                  systemImage: n.pinned ? "pin.fill" : "pin")
                        }
                        .help(n.pinned ? "Unpin" : "Pin")

                        Button {
                            Task { await store.update(n.id, patch: ["archived": !n.archived]) }
                        } label: {
                            Label(n.archived ? "Unarchive" : "Archive",
                                  systemImage: n.archived ? "tray.and.arrow.up" : "archivebox")
                        }
                        .help(n.archived ? "Unarchive" : "Archive")

                        Button(role: .destructive) {
                            Task { await store.trash(n) }
                        } label: {
                            Label("Trash", systemImage: "trash")
                        }
                        .help("Move to Trash")
                    }
                }
            }
    }

    private func scheduleSave(_ value: String) {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(600))
            if Task.isCancelled { return }
            await save(value)
        }
    }

    private func save(_ value: String) async {
        if let id = note?.id ?? createdId {
            await store.update(id, patch: ["body": value])
        } else if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            if let created = await store.create(body: value) {
                createdId = created.id
                onCreated(created.id)
            }
        }
    }
}
