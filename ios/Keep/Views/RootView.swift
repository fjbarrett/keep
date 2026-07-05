import CoreSpotlight
import SwiftUI

struct RootView: View {
    @Environment(NotesStore.self) private var store
    @State private var showSignIn = false
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            NotesListView()
                .navigationTitle("Keep")
                .navigationDestination(for: String.self) { id in
                    if let note = store.notes.first(where: { $0.id == id }) {
                        NoteEditorView(note: note)
                    }
                }
        }
        .task {
            await store.load()
            SpotlightIndexer.sync(store.notes)
        }
        // A 401 from the API flips needsAuth; present the native sign-in sheet.
        .onChange(of: store.needsAuth) { _, needs in showSignIn = needs }
        // Keep Spotlight in step with the notes, and open the note a Spotlight
        // result points at (its activity identifier is the note id).
        .onChange(of: store.notes) { _, notes in SpotlightIndexer.sync(notes) }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            if let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
                path = [id]
            }
        }
        .sheet(isPresented: $showSignIn) {
            SignInView()
                .interactiveDismissDisabled()
        }
    }
}
