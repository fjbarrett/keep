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
    @State private var filter: NoteFilter = .all
    @State private var query = ""
    @State private var composing = false
    @State private var pendingDelete: Note?
    @State private var shareTarget: ShareTarget?

    private var notes: [Note] {
        NotesStore.matching(
            query.trimmingCharacters(in: .whitespaces),
            in: NotesStore.inDisplayOrder(store.visibleNotes.filter(filter.matches))
        )
    }

    var body: some View {
        List {
            ForEach(notes) { note in
                NavigationLink(value: note.id) {
                    NoteRow(note: note)
                }
                .contextMenu { menu(for: note) }
                .swipeActions(edge: .leading) { leadingActions(for: note) }
                .swipeActions(edge: .trailing) { trailingActions(for: note) }
            }
        }
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
        .searchable(text: $query, prompt: "Search \(filter.rawValue.lowercased())")
        .navigationTitle(filter.rawValue)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { viewMenu }
            ToolbarItem(placement: .primaryAction) {
                Button { composing = true } label: {
                    Label("New note", systemImage: "square.and.pencil")
                }
                .disabled(!store.canEdit)
            }
        }
        .sheet(isPresented: $composing) {
            NavigationStack { NoteEditorView(note: nil) }
        }
        .sheet(item: $shareTarget) { target in
            ActivityView(url: target.url)
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
            Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                Task { await store.signOut() }
            }
        } label: {
            Label("View", systemImage: "line.3.horizontal.decrease.circle")
        }
    }

    @ViewBuilder
    private func menu(for note: Note) -> some View {
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

    @ViewBuilder
    private func leadingActions(for note: Note) -> some View {
        if note.trashed {
            Button {
                Task { await store.restore(note) }
            } label: {
                Label("Put Back", systemImage: "arrow.uturn.backward")
            }
            .tint(.blue)
        } else {
            Button {
                Task { await store.togglePin(note) }
            } label: {
                Label(note.pinned ? "Unpin" : "Pin", systemImage: "pin")
            }
            .tint(.orange)
        }
    }

    @ViewBuilder
    private func trailingActions(for note: Note) -> some View {
        if note.trashed {
            // Destructive and unrecoverable, so this one routes through the
            // confirmation alert rather than acting on the swipe itself.
            Button(role: .destructive) {
                pendingDelete = note
            } label: {
                Label("Delete", systemImage: "trash")
            }
        } else {
            Button(role: .destructive) {
                Task { await store.trash(note) }
            } label: {
                Label("Trash", systemImage: "trash")
            }
            Button {
                Task { await store.setArchived(note, !note.archived) }
            } label: {
                Label(note.archived ? "Unarchive" : "Archive", systemImage: "archivebox")
            }
            .tint(.indigo)
        }
    }
}

private struct NoteRow: View {
    let note: Note

    var body: some View {
        HStack(spacing: 8) {
            if let swatch = NotePalette.color(for: note.color) {
                Circle().fill(swatch).frame(width: 8, height: 8)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(note.displayTitle).font(.body).lineLimit(1)
                if let summary = note.displaySummary {
                    Text(summary).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer()
            if note.shareToken != nil {
                Image(systemName: "link").font(.caption2).foregroundStyle(.secondary)
            }
            if note.pinned {
                Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}
