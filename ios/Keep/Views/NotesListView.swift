import SwiftUI

/// The views a note can be listed under, mirroring the Mac sidebar
/// (`MacRootView.Filter`) and the web's own sections.
enum NoteFilter: String, CaseIterable, Identifiable {
    case all = "All Notes"
    case pinned = "Pinned"
    case archived = "Archived"
    case trash = "Trash"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .all: return "note.text"
        case .pinned: return "pin"
        case .archived: return "archivebox"
        case .trash: return "trash"
        }
    }

    func matches(_ note: Note) -> Bool {
        switch self {
        case .all: return !note.trashed && !note.archived
        case .pinned: return note.pinned && !note.trashed && !note.archived
        case .archived: return note.archived && !note.trashed
        case .trash: return note.trashed
        }
    }

    var emptyTitle: String {
        switch self {
        case .all: return "No notes"
        case .pinned: return "Nothing pinned"
        case .archived: return "Nothing archived"
        case .trash: return "Trash is empty"
        }
    }

    var emptyMessage: String {
        switch self {
        case .all: return "Tap the pencil to write your first note."
        case .pinned: return "Pin a note to keep it at the top of the list."
        case .archived: return "Archived notes are kept out of the main list."
        case .trash: return "Notes you trash land here until you delete them."
        }
    }
}

struct NotesListView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var filter: NoteFilter = .all
    @State private var query = ""
    @State private var showReadingSettings = false
    @State private var pendingDelete: Note?
    @State private var shareTarget: ShareTarget?
    @State private var export: NoteExport?
    let openNote: (Note?) -> Void

    private var notes: [Note] {
        NotesStore.matching(
            query.trimmingCharacters(in: .whitespaces),
            in: NotesStore.inDisplayOrder(store.visibleNotes.filter(filter.matches))
        )
    }

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top),
              count: dynamicTypeSize.isAccessibilitySize ? 1 : 2)
    }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(notes) { note in
                    Button { openNote(note) } label: {
                        NoteCard(note: note)
                    }
                    .buttonStyle(.plain)
                    .accessibilityValue(note.accessibilityState)
                    .accessibilityHint("Opens note. Touch and hold for note actions.")
                    .accessibilityActions { menu(for: note) }
                    .contextMenu { menu(for: note) }
                }
            }
            .padding(12)
        }
        .scrollBounceBehavior(.always)
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
        .overlay {
            if store.isLoading && store.visibleNotes.isEmpty {
                ProgressView()
            } else if notes.isEmpty && !query.isEmpty {
                ContentUnavailableView.search(text: query)
            } else if notes.isEmpty {
                ContentUnavailableView(
                    filter.emptyTitle,
                    systemImage: filter.symbol,
                    description: Text(filter.emptyMessage)
                )
            }
        }
        .refreshable { await store.load() }
        .modifier(NoteFileExporter(export: $export))
        .searchable(text: $query, prompt: "Search \(filter.rawValue.lowercased())")
        .navigationTitle(filter.rawValue)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { viewMenu }
            ToolbarItem(placement: .primaryAction) {
                Button { openNote(nil) } label: {
                    Label("New note", systemImage: "square.and.pencil")
                }
                .disabled(!store.canEdit)
            }
        }
        .sheet(isPresented: $showReadingSettings) {
            NavigationStack {
                ReadingSettings()
                    .toolbar { Button("Done") { showReadingSettings = false } }
            }
        }
        .sheet(item: $shareTarget) { target in
            NoteShareView(url: target.url)
        }
        .alert(
            "Delete this note permanently?",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let note = pendingDelete { Task { await store.deleteForever(note) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("“\(pendingDelete?.displayTitle ?? "")” will be deleted from all your devices. You can’t undo this.")
        }
    }

    private var viewMenu: some View {
        Menu {
            Picker("View", selection: $filter) {
                ForEach(NoteFilter.allCases) { f in
                    Label(f.rawValue, systemImage: f.symbol).tag(f)
                }
            }
            .pickerStyle(.inline)
            Divider()
            Button("Reading settings", systemImage: "textformat.size") { showReadingSettings = true }
            Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                Task { await store.signOut() }
            }
        } label: {
            Label("View", systemImage: "line.3.horizontal.decrease.circle")
        }
    }

    @ViewBuilder
    private func menu(for note: Note) -> some View {
        NoteExportMenu { format in
            // Read again when selected so an open menu cannot export an old draft.
            guard let current = store.visibleNotes.first(where: { $0.id == note.id }) else { return }
            export = NoteExport(title: current.title, body: current.body, format: format)
        }
        Divider()
        if note.trashed {
            Button("Put Back", systemImage: "arrow.uturn.backward") {
                Task { await store.restore(note) }
            }
            Button("Delete Permanently…", systemImage: "trash", role: .destructive) {
                pendingDelete = note
            }
        } else {
            Button(
                note.pinned ? "Unpin" : "Pin",
                systemImage: note.pinned ? "pin.slash" : "pin"
            ) {
                Task { await store.togglePin(note) }
            }
            Button(
                note.archived ? "Unarchive" : "Archive",
                systemImage: note.archived ? "tray.and.arrow.up" : "archivebox"
            ) {
                Task { await store.setArchived(note, !note.archived) }
            }
            Menu("Color", systemImage: "paintpalette") {
                ForEach(NotePalette.all, id: \.key) { entry in
                    Toggle(entry.label, isOn: Binding(
                        get: { note.color == entry.key },
                        set: { on in Task { await store.setColor(note, to: on ? entry.key : nil) } }
                    ))
                }
            }
            Divider()
            Button("Copy Text", systemImage: "doc.on.doc") { Pasteboard.copy(note.body) }
            Button("Share Link…", systemImage: "link") {
                Task {
                    if let url = await store.shareURL(for: note) {
                        shareTarget = ShareTarget(url: url)
                    }
                }
            }
            if note.shareToken != nil {
                Button("Stop Sharing", systemImage: "link.badge.plus") {
                    Task { await store.unshare(note) }
                }
            }
            Divider()
            Button("Move to Trash", systemImage: "trash", role: .destructive) {
                Task { await store.trash(note) }
            }
        }
    }

}

private struct NoteCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.colorScheme) private var colorScheme
    @ScaledMetric(relativeTo: .body) private var cardHeight = 168
    let note: Note

    private var preview: String {
        String((note.displaySummary ?? String(note.body.prefix(320))).prefix(320))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(note.displayTitle)
                .font(.headline)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                .fixedSize(horizontal: false, vertical: true)
            if !preview.isEmpty {
                Text(preview)
                    .font(.subheadline)
                    .foregroundStyle(Color.primary.opacity(0.72))
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 6 : 3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if note.pinned || note.shareToken != nil {
                HStack(spacing: 8) {
                    if note.pinned { Image(systemName: "pin.fill") }
                    if note.shareToken != nil { Image(systemName: "link") }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: cardHeight,
               maxHeight: dynamicTypeSize.isAccessibilitySize ? nil : cardHeight,
               alignment: .topLeading)
        .background {
            let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
            shape.fill(Color(.secondarySystemGroupedBackground))
            if let color = NotePalette.color(for: note.color) {
                shape.fill(color.opacity(colorScheme == .dark ? 0.26 : 0.22))
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

#Preview("Colored note cards") {
    let note = Note(id: "preview", title: "Weekend plans", color: "yellow",
                    body: "Train tickets\nPlaces to visit\nBring a notebook", pinned: true,
                    archived: false, trashed: false, markdown: false, highlight: false,
                    tags: [], createdAt: 0, updatedAt: 0)
    HStack(alignment: .top, spacing: 12) {
        NoteCard(note: note)
        NoteCard(note: Note(id: "empty", title: "A new idea", body: "", pinned: false,
                           archived: false, trashed: false, markdown: false, highlight: false,
                           tags: [], createdAt: 0, updatedAt: 0))
    }
    .padding(12)
    .background(Color(.systemGroupedBackground))
}
