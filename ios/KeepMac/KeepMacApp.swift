import SwiftUI

/// macOS client. Reuses the shared model, API, auth, and title logic from the
/// iOS target; only the views and Spotlight wiring are Mac-specific.
@main
struct KeepMacApp: App {
    @State private var store = NotesStore()

    var body: some Scene {
        WindowGroup {
            MacRootView()
                .environment(store)
                .frame(minWidth: 760, minHeight: 480)
        }
        .commands {
            // Replace the default "New" so ⌘N makes a note in our sidebar flow.
            CommandGroup(replacing: .newItem) {
                Button("New Note") {
                    NotificationCenter.default.post(name: .keepNewNote, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            NoteCommands(store: store)
        }
    }
}

/// The menu-bar Note menu. Acts on the list selection, published by
/// MacRootView through the `selectedNote` focused scene value.
struct NoteCommands: Commands {
    let store: NotesStore
    @FocusedValue(\.selectedNote) private var note: Note?

    var body: some Commands {
        CommandMenu("Note") {
            Button(note?.pinned == true ? "Unpin" : "Pin") {
                if let note { Task { await store.togglePin(note) } }
            }
            .keyboardShortcut("p", modifiers: [.command, .shift])
            .disabled(note == nil)

            Button(note?.archived == true ? "Unarchive" : "Archive") {
                if let note {
                    Task { await store.update(note.id, patch: ["archived": !note.archived]) }
                }
            }
            .keyboardShortcut("a", modifiers: [.command, .control])
            .disabled(note == nil)

            Divider()

            Button("Move to Trash") {
                if let note { Task { await store.trash(note) } }
            }
            .keyboardShortcut(.delete, modifiers: .command)
            .disabled(note == nil || note?.trashed == true)
        }
    }
}

private struct SelectedNoteKey: FocusedValueKey {
    typealias Value = Note
}

extension FocusedValues {
    var selectedNote: Note? {
        get { self[SelectedNoteKey.self] }
        set { self[SelectedNoteKey.self] = newValue }
    }
}

extension Notification.Name {
    /// Posted by the ⌘N menu command; MacRootView starts a new note on it.
    static let keepNewNote = Notification.Name("keep.newNote")
}
