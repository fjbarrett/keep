import SwiftUI

struct NotesListView: View {
    @Environment(NotesStore.self) private var store
    @State private var composing = false

    var body: some View {
        List {
            ForEach(store.sorted) { note in
                NavigationLink {
                    NoteEditorView(note: note)
                } label: {
                    NoteRow(note: note)
                }
                .swipeActions(edge: .leading) {
                    Button {
                        Task { await store.togglePin(note) }
                    } label: {
                        Label(note.pinned ? "Unpin" : "Pin", systemImage: "pin")
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        Task { await store.trash(note) }
                    } label: {
                        Label("Trash", systemImage: "trash")
                    }
                }
            }
        }
        .overlay { if store.isLoading && store.notes.isEmpty { ProgressView() } }
        .refreshable { await store.load() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { composing = true } label: { Image(systemName: "square.and.pencil") }
            }
        }
        .sheet(isPresented: $composing) {
            NavigationStack { NoteEditorView(note: nil) }
        }
        .alert("Something went wrong", isPresented: .constant(store.errorMessage != nil)) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}

private struct NoteRow: View {
    let note: Note

    var body: some View {
        HStack(spacing: 8) {
            if let color = note.color, let ui = noteColor(color) {
                Circle().fill(ui).frame(width: 8, height: 8)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(note.displayTitle).font(.body).lineLimit(1)
                if let summary = note.displaySummary {
                    Text(summary).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer()
            if note.pinned { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.secondary) }
        }
    }

    private func noteColor(_ key: String) -> Color? {
        switch key {
        case "blue": return .blue
        case "pink": return .pink
        case "green": return .green
        case "orange": return .orange
        case "purple": return .purple
        case "red": return .red
        default: return nil
        }
    }
}
