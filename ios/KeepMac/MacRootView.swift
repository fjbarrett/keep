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

    var body: some View {
        NavigationSplitView {
            List(Filter.allCases, selection: $filter) { f in
                Label(f.rawValue, systemImage: f.symbol).tag(f)
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 200, max: 240)
            .navigationTitle("Keep")
        } content: {
            List(selection: $selection) {
                ForEach(filteredNotes) { note in
                    MacNoteRow(note: note).tag(note.id)
                }
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
        } detail: {
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
        .task {
            await store.load()
            SpotlightIndexer.sync(store.notes)
        }
        .onChange(of: store.needsAuth) { _, needs in showSignIn = needs }
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
    }

    private var filteredNotes: [Note] {
        let base: [Note]
        switch filter ?? .all {
        case .all: base = store.notes.filter { !$0.trashed && !$0.archived }
        case .pinned: base = store.notes.filter { $0.pinned && !$0.trashed && !$0.archived }
        case .archived: base = store.notes.filter { $0.archived && !$0.trashed }
        case .trash: base = store.notes.filter { $0.trashed }
        }
        let sorted = base.sorted { a, b in
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
            if let color = note.color, let swatch = Self.color(color) {
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
            if note.pinned {
                Image(systemName: "pin.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private static func color(_ key: String) -> Color? {
        switch key {
        case "blue": return .blue
        case "pink": return .pink
        case "green": return .green
        case "orange": return .orange
        case "purple": return .purple
        case "red": return .red
        default: return nil
        }
    }
}
