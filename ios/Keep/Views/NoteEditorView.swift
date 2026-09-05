import SwiftUI

/// Autosaving editor. A new note (`note == nil`) is created on first save and
/// then patched, mirroring the web app's create→edit bridge.
struct NoteEditorView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private enum Field { case title, body }
    @FocusState private var focusedField: Field?

    let note: Note?
    @State private var body_ = ""
    @State private var title = ""
    @State private var isChangingColor = false
    @State private var draftID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    private var id: String { note?.id ?? draftID }

    /// The live note (the one passed in, or the one just created), read back
    /// from the store so the toolbar reflects the latest flags.
    private var current: Note? {
        store.visibleNotes.first { $0.id == id } ?? note
    }

    var body: some View {
        VStack(alignment: .leading) {
            TextField("Title", text: Binding(get: { title }, set: { value in
                guard value != title else { return }
                title = value
                stageDraft()
            }))
                .font(.title2.weight(.semibold))
                .textFieldStyle(.roundedBorder)
                .focused($focusedField, equals: .title)
                .submitLabel(.next)
                .onSubmit { focusedField = .body }
                .accessibilityLabel("Note title")
                .disabled(!store.canEdit)
            Group {
                if current == nil {
                    Text("Saves automatically").font(.caption).foregroundStyle(.secondary)
                } else {
                    DraftSaveStatus(id: id, horizontalPadding: 0) { _ in dismiss() }
                }
            }
            .padding(.vertical, 4)
            TextEditor(text: Binding(get: { body_ }, set: { value in
                guard value != body_ else { return }
                body_ = value
                stageDraft()
            }))
                .focused($focusedField, equals: .body)
                .scrollContentBackground(.hidden)
                .overlay(alignment: .topLeading) {
                    if body_.isEmpty {
                        Text("Start writing…")
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 8)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                    }
                }
                .modifier(ReadingStyle())
                .padding(8)
                .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(focusedField == .body ? Color.accentColor : Color.secondary,
                                      lineWidth: focusedField == .body ? 2 : 1)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                .accessibilityLabel("Note body")
                .accessibilityHint("Edit or add text. Changes save automatically.")
                .disabled(!store.canEdit)
        }
        .padding(.horizontal)
        .navigationTitle(note == nil ? "New note" : "Note")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            body_ = store.drafts.items[id]?.body ?? note?.body ?? ""
            title = store.drafts.items[id]?.title ?? note?.title ?? ""
        }
        .task {
            if note == nil {
                await Task.yield()
                guard !Task.isCancelled else { return }
                focusedField = .title
            }
        }
        .onDisappear { store.drafts.start(id) }
        .onChange(of: store.notes.first { $0.id == id }?.body) { _, body in
            if store.drafts.items[id] == nil, let body { body_ = body }
        }
        .onChange(of: store.notes.first { $0.id == id }?.title) { _, savedTitle in
            if store.drafts.items[id] == nil, let savedTitle { title = savedTitle }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    store.drafts.start(id)
                    focusedField = nil
                }
            }
            // Wait for first autosave before offering a server-backed color change.
            if let saved = store.notes.first(where: { $0.id == id }) {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Note color", selection: Binding(
                            get: { saved.color ?? "" },
                            set: { key in
                                isChangingColor = true
                                Task {
                                    await store.setColor(saved, to: key.isEmpty ? nil : key)
                                    isChangingColor = false
                                }
                            }
                        )) {
                            Label("None", systemImage: "circle.slash").tag("")
                            ForEach(NotePalette.all, id: \.key) { option in
                                Label {
                                    Text(option.label)
                                } icon: {
                                    NotePalette.swatch(for: option.key, scheme: colorScheme)
                                }
                                .accessibilityLabel(option.label)
                                .tag(option.key)
                            }
                        }
                    } label: {
                        Label("Note color", systemImage: "paintpalette")
                    }
                    .accessibilityValue(NotePalette.all.first { $0.key == saved.color }?.label ?? "None")
                    .disabled(!store.canEdit || isChangingColor)
                }
            }
            if note == nil {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func stageDraft() {
        store.drafts.stage(id: id, body: body_, base: store.notes.first { $0.id == id }, title: title)
    }

}
