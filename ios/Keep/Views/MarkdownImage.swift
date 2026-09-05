import SwiftUI

struct MarkdownImage: View {
    @Environment(NotesStore.self) private var store
    let url: URL
    let alt: String
    @State private var image: CGImage?
    @State private var failed = false
    @State private var retry = 0

    var body: some View {
        VStack(alignment: .leading) {
            if let image {
                Image(image, scale: 1, label: Text(alt.isEmpty ? "Note image" : alt))
                    .resizable().scaledToFit()
            } else if failed {
                Label(alt.isEmpty ? "Image unavailable" : alt, systemImage: "photo")
                Button("Retry image") { retry += 1 }
            } else {
                ProgressView(alt.isEmpty ? "Loading image" : "Loading " + alt)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: "\(store.sessionGeneration):\(url):\(retry)") {
            image = nil
            failed = false
            do {
                let loaded = try await store.image(url)
                try Task.checkCancellation()
                image = loaded
            } catch { if !Task.isCancelled { failed = true } }
        }
    }
}
