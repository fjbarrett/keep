import SwiftUI
import UIKit

@MainActor
enum Pasteboard {
    static func copy(_ string: String) {
        UIPasteboard.general.string = string
    }
}

/// A minted share link, ready to hand to the system share sheet. Identifiable
/// so it can drive `.sheet(item:)` — each tap presents a fresh sheet.
struct ShareTarget: Identifiable {
    let id = UUID()
    let url: URL
}

/// ShareLink keeps the sharing interface entirely in SwiftUI after URL creation.
struct NoteShareView: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL

    var body: some View {
        NavigationStack {
            Form {
                Text("Anyone with this link can read this note.")
                ShareLink("Share note link", item: url)
                Button("Copy link") { Pasteboard.copy(url.absoluteString) }
            }
            .navigationTitle("Share note")
            .toolbar { Button("Done") { dismiss() } }
        }
        .presentationDetents([.medium, .large])
    }
}
