import CoreSpotlight
import SwiftUI

struct RootView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.scenePhase) private var phase
    @State private var sheet: Sheet?
    @State private var spotlightID: String?
    @Namespace private var noteTransition

    private enum Sheet: Identifiable {
        case editor(Note?, sourceID: String?)
        case signIn

        var id: String {
            switch self {
            case .editor(let note, _): return note?.id ?? "new-note"
            case .signIn: return "sign-in"
            }
        }
    }

    var body: some View {
        NavigationStack {
            NotesListView(transitionNamespace: noteTransition, openNote: {
                spotlightID = nil
                sheet = .editor($0, sourceID: $0?.id)
            })
                .id(store.sessionGeneration)
                .navigationTitle("Keep")
        }
        .task {
            await store.load()
            SpotlightIndexer.sync(store.notes)
        }
        // A 401 from the API flips needsAuth; present the native sign-in sheet.
        .onChange(of: store.needsAuth) { _, needs in
            sheet = needs ? .signIn : nil
        }
        .onChange(of: store.sessionGeneration) { _, _ in
            sheet = store.needsAuth ? .signIn : nil
            spotlightID = nil
        }
        // Keep Spotlight in step with the notes, and open the note a Spotlight
        // result points at (its activity identifier is the note id).
        .onChange(of: store.notes) { _, notes in
            SpotlightIndexer.sync(notes)
            openSpotlightNote()
            if case .editor(let note?, _) = sheet,
               !store.visibleNotes.contains(where: { $0.id == note.id }) {
                sheet = nil
            }
        }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            if let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
                spotlightID = id
                openSpotlightNote()
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
        .sheet(item: $sheet) { sheetContent(for: $0) }
    }

    @ViewBuilder private func sheetContent(for destination: Sheet) -> some View {
        switch destination {
        case .editor(let note, let sourceID):
            NavigationStack { NoteEditorView(note: note) }
                .id(destination.id)
                .presentationDragIndicator(.hidden)
                .presentationBackground(.clear)
                .presentationCornerRadius(28)
                .modifier(NotePresentationTransition(sourceID: sourceID,
                                                     namespace: noteTransition))
        case .signIn:
            SignInView()
                .interactiveDismissDisabled()
        }
    }

    private func openSpotlightNote() {
        guard !store.needsAuth, let id = spotlightID,
              let note = store.visibleNotes.first(where: { $0.id == id }) else { return }
        spotlightID = nil
        sheet = .editor(note, sourceID: nil)
    }
}

private struct NotePresentationTransition: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let sourceID: String?
    let namespace: Namespace.ID

    func body(content: Content) -> some View {
        if #available(iOS 18, *), let sourceID, !reduceMotion {
            content.navigationTransition(.zoom(sourceID: sourceID, in: namespace))
        } else {
            content
        }
    }
}
