import SwiftUI

struct NoteExportMenu: View {
    let export: (NoteExport.Format) -> Void

    var body: some View {
        Menu("Export file", systemImage: "square.and.arrow.up") {
            ForEach(NoteExport.Format.allCases, id: \.self) { format in
                Button(format.label) { export(format) }
            }
        }
    }
}

/// Attach to the screen, not the transient context menu that starts the export.
struct NoteFileExporter: ViewModifier {
    @Binding var export: NoteExport?
    @State private var errorMessage: String?

    func body(content: Content) -> some View {
        content
            .fileExporter(
                isPresented: Binding(get: { export != nil }, set: { if !$0 { export = nil } }),
                document: export?.document,
                contentType: export?.format.contentType ?? .plainText,
                defaultFilename: export?.filename
            ) { result in
                if case .failure(let error) = result,
                   (error as? CocoaError)?.code != .userCancelled {
                    errorMessage = error.localizedDescription
                }
            }
            .alert("Couldn’t export note", isPresented: Binding(
                get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: { Text(errorMessage ?? "") }
    }
}
