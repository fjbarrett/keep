import SwiftUI

/// Autosaving editor. A new note (`note == nil`) is created on first save and
/// then patched, mirroring the web app's create→edit bridge.
struct NoteEditorView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let note: Note?
    @State private var body_ = ""
    @State private var draftID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    private var id: String { note?.id ?? draftID }

    /// The live note (the one passed in, or the one just created), read back
    /// from the store so the toolbar reflects the latest flags.
    private var current: Note? {
        store.visibleNotes.first { $0.id == id } ?? note
    }

    var body: some View {
        VStack(alignment: .leading) {
            DraftSaveStatus(id: id) { _ in dismiss() }
            if current?.markdown == true {
                MarkdownView(source: body_)
            } else {
                TextEditor(text: Binding(get: { body_ }, set: { value in
                    body_ = value
                    store.drafts.stage(id: id, body: value, base: store.notes.first { $0.id == id })
                }))
                    .font(.body)
                    .accessibilityLabel("Note body")
                    .disabled(!store.canEdit)
            }
        }
        .padding(.horizontal)
        .navigationTitle(current?.displayTitle ?? "New note")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { body_ = store.drafts.items[id]?.body ?? note?.body ?? "" }
        .onDisappear { store.drafts.start(id) }
        .onChange(of: store.notes.first { $0.id == id }?.body) { _, body in
            if store.drafts.items[id] == nil, let body { body_ = body }
        }
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

}
