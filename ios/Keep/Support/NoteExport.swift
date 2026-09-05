import SwiftUI
import UniformTypeIdentifiers

/// An immutable snapshot: exporting never waits for, or changes, a server save.
struct NoteExport {
    enum Format: String, CaseIterable {
        case text = "txt"
        case markdown = "md"

        var label: String { self == .text ? "Text (.txt)" : "Markdown (.md)" }
        var contentType: UTType {
            self == .text ? .plainText : UTType(filenameExtension: "md", conformingTo: .plainText)!
        }
    }

    let document: NoteTextDocument
    let filename: String
    let format: Format

    init(title: String, body: String, format: Format) {
        self.format = format
        document = NoteTextDocument(data: Data(body.utf8))
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = title.isEmpty ? NoteTitle.infer(body, fallback: "Note") : title
        // Joiners are needed for composed emoji and some written languages.
        let controls = CharacterSet.controlCharacters.subtracting(CharacterSet(charactersIn: "\u{200C}\u{200D}"))
        let forbidden = CharacterSet(charactersIn: "/\\:<>\"|?*").union(controls)
        let cleaned = candidate.components(separatedBy: forbidden).joined(separator: " ")
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
            .trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        // Leave room for the extension on filesystems with byte-based name limits,
        // without splitting an emoji or another composed character.
        var stem = ""
        for character in cleaned {
            guard stem.utf8.count + String(character).utf8.count <= 180 else { break }
            stem.append(character)
        }
        stem = stem.trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        filename = (stem.isEmpty ? "Note" : stem) + "." + format.rawValue
    }
}

struct NoteTextDocument: FileDocument {
    static var readableContentTypes: [UTType] { NoteExport.Format.allCases.map(\.contentType) }
    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        self.data = data
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
