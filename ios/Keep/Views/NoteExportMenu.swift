import SwiftUI

struct NoteExportMenu: View {
    let export: (NoteExport.Format) -> Void

    var body: some View {
        Menu {
            ForEach(NoteExport.Format.allCases, id: \.self) { format in
                Button(format.label) { export(format) }
            }
        } label: {
            Label { Text("Export file") } icon: { Self.saveIcon }
        }
    }

    @MainActor private static let saveIcon: Image = {
        let renderer = ImageRenderer(content: FloppyDisk()
            .stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
            .frame(width: 22, height: 22))
        renderer.scale = 3
        guard let pixels = renderer.cgImage else { return Image(systemName: "doc") }
        return Image(pixels, scale: 3, label: Text("Export file")).renderingMode(.template)
    }()
}

private struct FloppyDisk: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 3, y: 2))
        path.addLine(to: CGPoint(x: 18, y: 2))
        path.addLine(to: CGPoint(x: 22, y: 6))
        path.addLine(to: CGPoint(x: 22, y: 22))
        path.addLine(to: CGPoint(x: 2, y: 22))
        path.addLine(to: CGPoint(x: 2, y: 3))
        path.closeSubpath()
        path.move(to: CGPoint(x: 7, y: 2))
        path.addLine(to: CGPoint(x: 7, y: 9))
        path.addLine(to: CGPoint(x: 17, y: 9))
        path.addLine(to: CGPoint(x: 17, y: 2))
        path.move(to: CGPoint(x: 6, y: 22))
        path.addLine(to: CGPoint(x: 6, y: 14))
        path.addLine(to: CGPoint(x: 18, y: 14))
        path.addLine(to: CGPoint(x: 18, y: 22))
        return path.applying(CGAffineTransform(scaleX: rect.width / 24, y: rect.height / 24)
            .concatenating(CGAffineTransform(translationX: rect.minX, y: rect.minY)))
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
