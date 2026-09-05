import SwiftUI

struct DraftSaveStatus: View {
    @Environment(NotesStore.self) private var store
    @State private var showRecovery = false
    let id: String
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
        .padding(.horizontal)
        .sheet(isPresented: $showRecovery) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Retry saving, or create a separate copy.")
                        Button { store.drafts.start(id) } label: {
                            Text(store.drafts.saving.contains(id) ? "Retrying…" : "Retry")
                                .frame(maxWidth: .infinity)
                        }
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
