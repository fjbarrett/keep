import SwiftUI

/// Read-only markdown rendering for the Mac editor's preview mode, standing in
/// for the web's react-markdown pane. Parses with Foundation's markdown
/// support and lays out block intents (headings, lists, quotes, code fences)
/// that `Text` alone won't style.
struct MacMarkdownView: View {
    let source: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(blocks) { block in
                    view(for: block)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }

    private struct Block: Identifiable {
        enum Kind {
            case paragraph
            case heading(Int)
            case code
            case quote
            case listItem(marker: String)
            case rule
        }

        let id: Int
        let kind: Kind
        let text: AttributedString
    }

    private var blocks: [Block] {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full,
            failurePolicy: .returnPartiallyParsedIfPossible
        )
        guard let parsed = try? AttributedString(markdown: source, options: options) else {
            return [Block(id: 0, kind: .paragraph, text: AttributedString(source))]
        }

        var result: [Block] = []
        for (intent, range) in parsed.runs[\.presentationIntent] {
            var text = AttributedString(parsed[range])
            text.presentationIntent = nil

            guard let intent else {
                result.append(Block(id: result.count, kind: .paragraph, text: text))
                continue
            }

            var kind = Block.Kind.paragraph
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
            result.append(Block(id: result.count, kind: kind, text: text))
        }
        return result
    }

    @ViewBuilder
    private func view(for block: Block) -> some View {
        switch block.kind {
        case .paragraph:
            Text(block.text)
                .textSelection(.enabled)
        case .heading(let level):
            Text(block.text)
                .font(headingFont(level))
                .textSelection(.enabled)
                .padding(.top, level <= 2 ? 4 : 0)
        case .code:
            ScrollView(.horizontal) {
                Text(block.text)
                    .font(.body.monospaced())
                    .textSelection(.enabled)
                    .padding(10)
            }
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
        case .quote:
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(.tertiary)
                    .frame(width: 3)
                Text(block.text)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        case .listItem(let marker):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(marker)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 14, alignment: .trailing)
                Text(block.text)
                    .textSelection(.enabled)
            }
            .padding(.leading, 4)
        case .rule:
            Divider()
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .title.weight(.bold)
        case 2: return .title2.weight(.semibold)
        case 3: return .title3.weight(.semibold)
        default: return .headline
        }
    }
}
