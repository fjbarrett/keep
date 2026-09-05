import SwiftUI

struct DraftSaveStatus: View {
    @Environment(NotesStore.self) private var store
    let id: String
    var onCopy: (String) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(status).font(.caption).foregroundStyle(.secondary)
                .accessibilityLabel("Save status: " + status)
            if let error = store.drafts.errors[id] {
                Text(error).font(.caption)
                HStack {
                    Button("Retry") { store.drafts.start(id) }
                    Button("Save a copy") {
                        if let copy = store.drafts.saveCopy(id) { onCopy(copy) }
                    }
                }
                .disabled(store.drafts.saving.contains(id))
            }
        }
        .padding(.horizontal)
        .onChange(of: store.drafts.errors[id]) { _, error in
            if let error { AccessibilityNotification.Announcement("Save needs attention. " + error).post() }
        }
    }

    private var status: String {
        if store.drafts.errors[id] != nil { return "Save needs attention" }
        if store.drafts.saving.contains(id) { return "Saving…" }
        return store.drafts.items[id] == nil ? "Saved" : "Saved on this device"
    }
}
