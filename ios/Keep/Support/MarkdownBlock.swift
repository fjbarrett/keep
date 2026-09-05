import Foundation

struct MarkdownBlock: Identifiable {
    enum Kind {
        case paragraph
        case heading(Int)
        case code
        case quote
        case listItem(marker: String)
        case rule
        case image(URL)
    }

    let id: Int
    let kind: Kind
    let text: AttributedString

    static func parse(_ source: String) -> [MarkdownBlock] {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        guard let parsed = try? AttributedString(markdown: source, options: options) else {
            return [MarkdownBlock(id: 0, kind: .paragraph, text: AttributedString(source))]
        }

        var result: [MarkdownBlock] = []
        for (intent, range) in parsed.runs[\.presentationIntent] {
            var text = AttributedString(parsed[range])
            text.presentationIntent = nil

            guard let intent else {
                result.append(MarkdownBlock(id: result.count, kind: .paragraph, text: text))
                continue
            }

            var kind = MarkdownBlock.Kind.paragraph
            var ordinal: Int?
            var ordered = false
            for component in intent.components {
                switch component.kind {
                case .header(let level): kind = .heading(level)
                case .codeBlock: kind = .code
                case .blockQuote: kind = .quote
                case .listItem(let n): ordinal = n
                case .orderedList: ordered = true
                case .thematicBreak: kind = .rule
                default: break
                }
            }
            if case .paragraph = kind, let ordinal {
                kind = .listItem(marker: ordered ? "\(ordinal)." : "•")
            }
            for (url, imageRange) in text.runs[\.imageURL] {
                let part = AttributedString(text[imageRange])
                result.append(MarkdownBlock(id: result.count, kind: url.map(Kind.image) ?? kind, text: part))
            }
        }
        return result
    }

}
