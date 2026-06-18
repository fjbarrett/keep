import SwiftUI

struct RootView: View {
    @Environment(NotesStore.self) private var store
    @State private var showSignIn = false

    var body: some View {
        NavigationStack {
            NotesListView()
                .navigationTitle("Keep")
        }
        .task { await store.load() }
        // A 401 from the API flips needsAuth; present the native sign-in sheet.
        .onChange(of: store.needsAuth) { _, needs in showSignIn = needs }
        .sheet(isPresented: $showSignIn) {
            SignInView()
                .interactiveDismissDisabled()
        }
    }
}
