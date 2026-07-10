import AppKit

/// Mac-side share helper: makes sure the public link exists, then puts it on
/// the pasteboard. Lives in the Mac target because of NSPasteboard.
extension NotesStore {
    func copyShareLink(_ note: Note) async {
        guard let token = (await share(note))?.shareToken else { return }
        let url = Config.baseURL.appendingPathComponent("p/\(token)")
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(url.absoluteString, forType: .string)
    }
}
