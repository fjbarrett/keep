import SwiftUI

/// The editor pane. Autosaves the body (debounced ~0.6s, like the web), and a
/// new note (`note == nil`) is created on first non-empty save then patched —
/// mirroring the web/iOS create→edit bridge. Pin / archive / trash live in the
/// toolbar; the title is renamed inline, committing on Enter or focus loss
/// like the web editor's header field.
struct MacNoteDetail: View {
    @Environment(NotesStore.self) private var store

    let note: Note?
    var onCreated: (String) -> Void = { _ in }

    @State private var text = ""
    @State private var title = ""
    @FocusState private var titleFocused: Bool
    @State private var draftID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    private var id: String { note?.id ?? draftID }

    private let titleCharLimit = 36

    /// The live note (existing, or the one we just created), pulled fresh from
    /// the store so toolbar state (pin/archive) reflects the latest.
    private var current: Note? {
        store.visibleNotes.first { $0.id == id } ?? note
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DraftSaveStatus(id: id, onCopy: onCreated)
            // Note-colour edge, mirroring the web card's inset top border.
            if let key = current?.color, let swatch = NotePalette.color(for: key) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(swatch)
                    .frame(height: 3)
                    .padding(.bottom, 10)
            }
            if let n = current {
                titleField(for: n)
                Text(editedCaption(n.updatedDate))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.bottom, 10)
            }
            if current?.markdown == true {
                MacMarkdownView(source: text)
            } else {
                TextEditor(text: Binding(get: { text }, set: { value in
                    text = value
                    store.drafts.stage(id: id, body: value, base: store.notes.first { $0.id == id })
                }))
                    .font(KeepTheme.editorFont())
                    .accessibilityLabel("Note body")
                    .disabled(!store.canEdit)
                    .textEditorStyle(.plain)
                    .scrollContentBackground(.hidden)
                    // The app-wide cobalt tint recolors the insertion point;
                    // keep the caret paper-white like the text itself.
                    .accentColor(.white)
                    .overlay(alignment: .topLeading) {
                        if text.isEmpty {
                            // Aligned to the text container origin: NSTextView
                            // carries a 5pt line-fragment pad horizontally and
                            // (near-)zero top inset, so any extra top padding
                            // visibly sinks the hint below the caret.
                            Text("Start writing…")
                                .font(KeepTheme.editorFont())
                                .foregroundStyle(.tertiary)
                                .padding(.leading, 5)
                                .allowsHitTesting(false)
                        }
                    }
            }
        }
        .padding(12)
        .navigationTitle(current?.displayTitle ?? "New Note")
        .onAppear {
            text = store.drafts.items[id]?.body ?? note?.body ?? ""
            title = current?.displayTitle ?? ""
        }
        .onChange(of: current?.id) { _, _ in
            if !titleFocused { title = current?.displayTitle ?? "" }
        }
        .onDisappear { store.drafts.start(id) }
        .onChange(of: store.notes.first { $0.id == id }) { _, saved in
            if let saved, note == nil { onCreated(saved.id) }
            if store.drafts.items[id] == nil, let saved { text = saved.body }
        }
            .toolbar {
                if let n = current {
                    ToolbarItemGroup {
                        Button {
                            // Markdown and highlight are mutually exclusive,
                            // matching the web toggles.
                            let patch: [String: Any] = n.markdown
                                ? ["markdown": false]
                                : ["markdown": true, "highlight": false]
                            Task { await store.update(n.id, patch: patch) }
                        } label: {
                            Label(n.markdown ? "Edit Text" : "Preview Markdown",
                                  systemImage: n.markdown ? "square.and.pencil" : "doc.richtext")
                        }
                        .help(n.markdown ? "Back to editing" : "Preview as Markdown")

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

    @ViewBuilder
    private func titleField(for n: Note) -> some View {
        if n.trashed {
            Text(n.displayTitle)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.bottom, 8)
        } else {
            TextField("Title", text: $title)
                .font(.title3.weight(.semibold))
                .textFieldStyle(.plain)
                .focused($titleFocused)
                .onSubmit { titleFocused = false }
                .onExitCommand {
                    title = n.displayTitle
                    titleFocused = false
                }
                .onChange(of: title) { _, value in
                    if value.count > titleCharLimit {
                        title = String(value.prefix(titleCharLimit))
                    }
                }
                .onChange(of: titleFocused) { _, focused in
                    if !focused { commitTitle(for: n) }
                }
                .padding(.bottom, 8)
        }
    }

    private func commitTitle(for n: Note) {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed != n.displayTitle else {
            title = n.displayTitle
            return
        }
        Task { await store.update(n.id, patch: ["title": trimmed]) }
    }

}
