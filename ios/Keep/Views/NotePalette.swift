import SwiftUI

/// The web app's note-label palette (lib/noteColors.ts) on system colors.
///
/// Duplicated from the Mac target's copy in `KeepMac/MacRootView.swift` — it
/// belongs in `Keep/Support` where both targets would share it, but that file
/// is being reworked in parallel. Hoist it once the Mac work lands.
enum NotePalette {
    static let all: [(key: String, label: String, color: Color)] = [
        ("blue", "Blue", .blue),
        ("purple", "Purple", .purple),
        ("pink", "Pink", .pink),
        ("red", "Red", .red),
        ("orange", "Orange", .orange),
        ("yellow", "Yellow", .yellow),
        ("green", "Green", .green),
        ("graphite", "Graphite", .gray),
    ]

    static func color(for key: String?) -> Color? {
        all.first { $0.key == key }?.color
    }

    // Menus flatten symbol foreground styles. Cache tiny original-color SwiftUI
    // images so each option keeps its swatch in both light and dark appearance.
    @MainActor private static var swatches: [String: Image] = [:]

    @MainActor static func swatch(for key: String, scheme: ColorScheme) -> Image {
        let cacheKey = key + (scheme == .dark ? "-dark" : "-light")
        if let image = swatches[cacheKey] { return image }
        let renderer = ImageRenderer(content: Circle().fill(color(for: key) ?? .gray)
            .frame(width: 16, height: 16).environment(\.colorScheme, scheme))
        renderer.scale = 3
        guard let pixels = renderer.cgImage else { return Image(systemName: "circle.fill") }
        let image = Image(decorative: pixels, scale: 3).renderingMode(.original)
        swatches[cacheKey] = image
        return image
    }
}
