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
        }
    }
}

extension Notification.Name {
    /// Posted by the ⌘N menu command; MacRootView starts a new note on it.
    static let keepNewNote = Notification.Name("keep.newNote")
}
