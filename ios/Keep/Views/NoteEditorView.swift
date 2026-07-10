import SwiftUI

/// Autosaving editor. A new note (`note == nil`) is created on first save and
/// then patched, mirroring the web app's create→edit bridge.
struct NoteEditorView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let note: Note?
    @State private var body_ = ""
    @State private var createdId: String?
    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        TextEditor(text: $body_)
            .font(.body)
            .padding(.horizontal)
            .navigationTitle(note?.displayTitle ?? "New note")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { body_ = note?.body ?? "" }
            .onChange(of: body_) { _, newValue in scheduleSave(newValue) }
            .toolbar {
                if note == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
    }

    /// Debounced autosave (~0.6s), matching the web debounce feel.
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
            }
        }
    }
}
