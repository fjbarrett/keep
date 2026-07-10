import AppKit

@MainActor
enum MacPasteboard {
    static func copy(_ string: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(string, forType: .string)
    }
}

/// Mac-side share helper: makes sure the public link exists, then puts it on
/// the pasteboard. Lives in the Mac target because of NSPasteboard.
extension NotesStore {
    func copyShareLink(_ note: Note) async {
        guard let token = (await share(note))?.shareToken else { return }
        MacPasteboard.copy(Config.baseURL.appendingPathComponent("p/\(token)").absoluteString)
    }
}
