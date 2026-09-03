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

    /// The live note (the one passed in, or the one just created), read back
    /// from the store so the toolbar reflects the latest flags.
    private var current: Note? {
        if let note { return store.notes.first { $0.id == note.id } ?? note }
        if let createdId { return store.notes.first { $0.id == createdId } }
        return nil
    }

    var body: some View {
        Group {
            if current?.markdown == true {
                MarkdownView(source: body_)
            } else {
                TextEditor(text: $body_)
                    .font(.body)
            }
        }
        .padding(.horizontal)
        .navigationTitle(current?.displayTitle ?? "New note")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { body_ = note?.body ?? "" }
        .onChange(of: body_) { _, newValue in scheduleSave(newValue) }
        .toolbar {
            if let note = current {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        // The note's own markdown flag is the toggle, same as
                        // the web and Mac — the two render modes are exclusive.
                        Task {
                            await store.update(
                                note.id,
                                patch: note.markdown
                                    ? ["markdown": false]
                                    : ["markdown": true, "highlight": false]
                            )
                        }
                    } label: {
                        Label(
                            note.markdown ? "Edit Text" : "Preview Markdown",
                            systemImage: note.markdown ? "square.and.pencil" : "doc.richtext"
                        )
                    }
                }
            }
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
