import SwiftUI

@main
struct KeepApp: App {
    @State private var store = NotesStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
        }
    }
}
