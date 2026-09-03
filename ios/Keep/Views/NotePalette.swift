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
}
