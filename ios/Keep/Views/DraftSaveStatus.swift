import SwiftUI

struct DraftSaveStatus: View {
    @Environment(NotesStore.self) private var store
    @State private var showRecovery = false
    @State private var confirmDiscard = false
    let id: String
    var horizontalPadding: CGFloat = 16
    var onCopy: (String) -> Void = { _ in }

    var body: some View {
        Group {
            if store.drafts.errors[id] != nil {
                Button { showRecovery = true } label: {
                    Label(status, systemImage: "exclamationmark.triangle")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityHint("Show the save error and recovery options")
            } else {
                Text(status).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(.caption)
        .accessibilityLabel("Save status: " + status)
        .padding(.horizontal, horizontalPadding)
        .sheet(isPresented: $showRecovery) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text(store.drafts.requiresResolution.contains(id)
                             ? "Save a separate copy, or discard this draft to keep the server version."
                             : "Retry saving, or create a separate copy.")
                        if !store.drafts.requiresResolution.contains(id) {
                            Button { store.drafts.start(id) } label: {
                                Text(store.drafts.saving.contains(id) ? "Retrying…" : "Retry")
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        Button("Discard draft", role: .destructive) { confirmDiscard = true }
                        Button {
                            if let copy = store.drafts.saveCopy(id) {
                                showRecovery = false
                                onCopy(copy)
                            }
                        } label: {
                            Text("Save a copy").frame(maxWidth: .infinity)
                        }
                        if let error = store.drafts.errors[id] {
                            Text(error).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .buttonStyle(.bordered)
                    .disabled(store.drafts.saving.contains(id))
                    .padding()
                }
                .confirmationDialog("Discard the unsynced text on this device?", isPresented: $confirmDiscard) {
                    Button("Discard draft", role: .destructive) {
                        do { try store.drafts.discard(id); showRecovery = false }
                        catch { store.errorMessage = error.localizedDescription }
                    }
                } message: { Text("The server version will be kept. This cannot be undone.") }
                .navigationTitle("Save recovery")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #else
                .frame(minWidth: 360, minHeight: 360)
                #endif
                .toolbar { Button("Done") { showRecovery = false } }
            }
        }
        .onChange(of: store.drafts.items[id] == nil) { _, saved in
            if saved { showRecovery = false }
        }
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
