import CoreSpotlight
import SwiftUI

struct RootView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.scenePhase) private var phase
    @State private var showSignIn = false
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            NotesListView()
                .id(store.sessionGeneration)
                .navigationTitle("Keep")
                .navigationDestination(for: String.self) { id in
                    if let note = store.visibleNotes.first(where: { $0.id == id }) {
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
        .onChange(of: store.sessionGeneration) { _, _ in path = [] }
        // Keep Spotlight in step with the notes, and open the note a Spotlight
        // result points at (its activity identifier is the note id).
        .onChange(of: store.notes) { _, notes in SpotlightIndexer.sync(notes) }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            if let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
                path = [id]
            }
        }
        .onChange(of: phase) { _, phase in
            if phase == .active { Task { await store.load() } }
            if phase == .background { store.drafts.retryAll() }
        }
        .alert("Something went wrong", isPresented: Binding(
            get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } }
        )) { Button("OK") { store.errorMessage = nil } }
        message: { Text(store.errorMessage ?? "") }
        .sheet(isPresented: $showSignIn) {
            SignInView()
                .interactiveDismissDisabled()
        }
    }
}
