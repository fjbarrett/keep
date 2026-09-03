import SwiftUI

/// Get Info panel: the web's NoteInfoModal as a Mac sheet. Takes the note id
/// and reads the note live from the store so share/unshare refresh in place.
struct MacGetInfoView: View {
    @Environment(NotesStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    let noteId: Note.ID

    private var note: Note? {
        store.notes.first { $0.id == noteId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let note {
                Text(note.displayTitle)
                    .font(.headline)
                    .lineLimit(2)
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                    infoRow("Created", value: fullDate(note.createdAt))
                    infoRow("Modified", value: fullDate(note.updatedAt))
                    infoRow("Words", value: "\(wordCount(note.body))")
                    infoRow("Characters", value: "\(note.body.count)")
                    if let label = NotePalette.all.first(where: { $0.key == note.color })?.label {
                        infoRow("Color", value: label)
                    }
                }
                .font(.callout)
                Divider()
                if let token = note.shareToken {
                    let link = Config.baseURL.appendingPathComponent("p/\(token)").absoluteString
                    Text(link)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    HStack {
                        Button("Copy Link") { MacPasteboard.copy(link) }
                        Spacer()
                        Button("Stop Sharing", role: .destructive) {
                            Task { await store.unshare(note) }
                        }
                    }
                } else {
                    HStack {
                        Button("Share…") { Task { await store.share(note) } }
                        Spacer()
                    }
                }
            } else {
                Text("This note is no longer available.")
                    .foregroundStyle(.secondary)
            }
            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .frame(width: 320)
    }

    private func infoRow(_ label: String, value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(.secondary)
            Text(value).textSelection(.enabled)
        }
    }

    private func fullDate(_ millis: Double) -> String {
        let date = Date(timeIntervalSince1970: millis / 1000)
        let format = DateFormatter()
        format.dateStyle = .medium
        format.timeStyle = .short
        return format.string(from: date)
    }

    private func wordCount(_ body: String) -> Int {
        body.split { $0.isWhitespace || $0.isNewline }.count
    }
}
