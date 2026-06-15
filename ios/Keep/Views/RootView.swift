import SwiftUI

struct RootView: View {
    @Environment(NotesStore.self) private var store

    var body: some View {
        NavigationStack {
            NotesListView()
                .navigationTitle("Keep")
        }
        .task { await store.load() }
    }
}
