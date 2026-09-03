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

/// The system share sheet. SwiftUI's `ShareLink` needs its URL up front, but
/// the link doesn't exist until the server mints a token, so present this once
/// the token is back instead.
struct ActivityView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
