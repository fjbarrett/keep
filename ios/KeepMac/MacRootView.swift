import SwiftUI

/// Three-column Mac layout: sidebar of filters, the note list, and the editor.
/// Handles search, the Spotlight deep link, sign-in, and keeps the Spotlight
/// index in step with the notes.
struct MacRootView: View {
    @Environment(NotesStore.self) private var store

    enum Filter: String, CaseIterable, Identifiable {
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
    }

    @State private var filter: Filter? = .all
    @State private var selection: Note.ID?
    @State private var composing = false
    @State private var query = ""
    @State private var showSignIn = false
    @State private var pendingDelete: Note?
    @State private var infoNote: Note?

    var body: some View {
        NavigationSplitView {
            sidebar
        } content: {
            noteList
        } detail: {
            detail
        }
        .focusedSceneValue(\.selectedNote, selectedNote)
        .task {
            await store.load()
            SpotlightIndexer.sync(store.notes)
        }
        .onChange(of: store.needsAuth) { _, needs in showSignIn = needs }
        .onChange(of: store.sessionGeneration) { _, _ in
            selection = nil
            composing = false
            query = ""
            infoNote = nil
            pendingDelete = nil
        }
        // Deselect when an action (pin/archive/trash/restore) moves the note
        // out of the current filter, so the detail pane follows the list.
        .onChange(of: selectedNote) { _, note in
            if let note, !matches(note) { selection = nil }
        }
        .onChange(of: store.notes) { _, notes in SpotlightIndexer.sync(notes) }
        .onReceive(NotificationCenter.default.publisher(for: .keepNewNote)) { _ in
            startCompose()
        }
        // Spotlight result tapped → open that note. Forwarded by the app
        // delegate (see KeepMacApp); onContinueUserActivity never fires on macOS.
        .onReceive(NotificationCenter.default.publisher(for: .keepOpenNote)) { note in
            guard let id = note.object as? String else { return }
            composing = false
            filter = .all
            selection = id
        }
        // ⌘I / Note menu → Get Info for the focused note.
        .onReceive(NotificationCenter.default.publisher(for: .keepShowInfo)) { note in
            guard let id = note.object as? String,
                  let found = store.notes.first(where: { $0.id == id })
            else { return }
            infoNote = found
        }
        .sheet(item: $infoNote) { note in
            MacGetInfoView(noteId: note.id)
        }
        .sheet(isPresented: $showSignIn) {
            SignInView()
                .frame(minWidth: 400, minHeight: 440)
        }
        .alert(
            "Something went wrong",
            isPresented: .constant(store.errorMessage != nil)
        ) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
        .alert(
            "Delete this note permanently?",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            )
        ) {
            Button("Delete", role: .destructive) {
                if let note = pendingDelete {
                    Task { await store.deleteForever(note) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("“\(pendingDelete?.displayTitle ?? "")” will be deleted from all your devices. You can’t undo this.")
        }
    }

    private var sidebar: some View {
        List(Filter.allCases, selection: $filter) { f in
            Label(f.rawValue, systemImage: f.symbol).tag(f)
        }
        .navigationSplitViewColumnWidth(min: 170, ideal: 200, max: 240)
        .navigationTitle("Keep")
    }

    private var noteList: some View {
        List(selection: $selection) {
            if (filter ?? .all) == .all {
                let pinned = filteredNotes.filter(\.pinned)
                if !pinned.isEmpty {
                    Section("Pinned") { rows(pinned) }
                }
                Section("Notes") { rows(filteredNotes.filter { !$0.pinned }) }
            } else {
                rows(filteredNotes)
            }
        }
        .onDeleteCommand {
            guard let note = selectedNote else { return }
            if note.trashed { pendingDelete = note }
            else { Task { await store.trash(note) } }
        }
        .overlay {
            if store.isLoading && store.notes.isEmpty {
                ProgressView()
            } else if filteredNotes.isEmpty {
                ContentUnavailableView(
                    query.isEmpty ? "No notes" : "No matches",
                    systemImage: "magnifyingglass"
                )
            }
        }
        .searchable(text: $query, prompt: "Search notes")
        .navigationTitle(filter?.rawValue ?? "Notes")
        .navigationSplitViewColumnWidth(min: 240, ideal: 300)
        .toolbar {
            ToolbarItem {
                Button(action: startCompose) {
                    Label("New Note", systemImage: "square.and.pencil")
                }
                .keyboardShortcut("n", modifiers: .command)
                .help("New note")
            }
        }
    }

    @ViewBuilder
    private var detail: some View {
        if composing {
            MacNoteDetail(note: nil) { id in
                composing = false
                filter = .all
                selection = id
            }
            .id("new-note")
        } else if let id = selection,
                  let note = store.notes.first(where: { $0.id == id }) {
            MacNoteDetail(note: note)
                .id(note.id)
        } else {
            ContentUnavailableView(
                "Select a note",
                systemImage: "note.text",
                description: Text("Choose a note, or press ⌘N to create one.")
            )
        }
    }

    private func rows(_ notes: [Note]) -> some View {
        ForEach(notes) { note in
            MacNoteRow(note: note)
                .tag(note.id)
                .contextMenu { contextMenu(for: note) }
        }
    }

    @ViewBuilder
    private func contextMenu(for note: Note) -> some View {
        if note.trashed {
            Button("Put Back") { Task { await store.restore(note) } }
            Button("Get Info…") { infoNote = note }
            Button("Delete Permanently…", role: .destructive) { pendingDelete = note }
        } else {
            Button(note.pinned ? "Unpin" : "Pin") { Task { await store.togglePin(note) } }
            Button(note.archived ? "Unarchive" : "Archive") {
                Task { await store.update(note.id, patch: ["archived": !note.archived]) }
            }
            Menu("Color") {
                ForEach(NotePalette.all, id: \.key) { entry in
                    Toggle(entry.label, isOn: Binding(
                        get: { note.color == entry.key },
                        set: { on in Task { await store.setColor(note, to: on ? entry.key : nil) } }
                    ))
                }
            }
            Divider()
            Button("Get Info…") { infoNote = note }
            Button("Copy Text") { MacPasteboard.copy(note.body) }
            Button("Copy Share Link") { Task { await store.copyShareLink(note) } }
            if note.shareToken != nil {
                Button("Stop Sharing") { Task { await store.unshare(note) } }
            }
            Divider()
            Button("Move to Trash", role: .destructive) { Task { await store.trash(note) } }
        }
    }

    private var selectedNote: Note? {
        selection.flatMap { id in store.notes.first { $0.id == id } }
    }

    private func matches(_ note: Note) -> Bool {
        switch filter ?? .all {
        case .all: return !note.trashed && !note.archived
        case .pinned: return note.pinned && !note.trashed && !note.archived
        case .archived: return note.archived && !note.trashed
        case .trash: return note.trashed
        }
    }

    private var filteredNotes: [Note] {
        let sorted = store.notes.filter(matches).sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            return a.updatedAt > b.updatedAt
        }
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return sorted }
        let tokens = q.split(separator: " ").map(String.init)
        return sorted.filter { note in
            let hay = (note.title + "\n" + note.body).lowercased()
            return tokens.allSatisfy { hay.contains($0) }
        }
    }

    private func startCompose() {
        selection = nil
        composing = true
    }
}

/// A row in the note list: colour dot, title, one-line summary, pin marker.
private struct MacNoteRow: View {
    let note: Note

    var body: some View {
        HStack(spacing: 8) {
            if let swatch = NotePalette.color(for: note.color) {
                Circle().fill(swatch).frame(width: 8, height: 8)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(note.displayTitle).lineLimit(1)
                if let summary = note.displaySummary {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            if note.shareToken != nil {
                Image(systemName: "link")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if note.pinned {
                Image(systemName: "pin.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// The web app's note-label palette (lib/noteColors.ts) on system colors.
enum NotePalette {
    static let all: [(key: String, label: String, color: Color)] = [
        ("blue", "Blue", .blue),
        ("purple", "Purple", .purple),
        ("pink", "Pink", .pink),
        ("red", "Red", .red),
        ("orange", "Orange", .orange),
        ("yellow", "Yellow", .yellow),
        ("green", "Green", .green),
        ("graphite", "Graphite", .gray),
    ]

    static func color(for key: String?) -> Color? {
        all.first { $0.key == key }?.color
    }
}
