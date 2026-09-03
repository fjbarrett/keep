import SwiftUI

/// The web app's visual language (app/globals.css) in SwiftUI form: a cool
/// graphite desk with one cobalt action color. Only the accent is applied
/// app-wide — surfaces stay system-adaptive so the app respects the Mac's
/// light and dark modes instead of forcing the web's dark desk.
enum KeepTheme {
    /// `--color-accent`: links, selection, primary buttons, focus.
    static let accent = Color(red: 0x2B / 255, green: 0x60 / 255, blue: 0xF2 / 255)

    /// Body text size matching the web editor's 15px note surface.
    static func editorFont() -> Font { .system(size: 15) }
}

/// Formats an "Edited September 2 at 3:40 AM" caption like the web editor.
func editedCaption(_ date: Date) -> String {
    let calendar = Calendar.current
    let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: Date())
    let dateStyle = DateFormatter()
    dateStyle.dateFormat = sameYear ? "MMMM d" : "MMMM d, yyyy"
    let timeStyle = DateFormatter()
    timeStyle.dateFormat = "h:mm a"
    return "Edited \(dateStyle.string(from: date)) at \(timeStyle.string(from: date))"
}
