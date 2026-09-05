import SwiftUI

/// Read-only markdown rendering for the editors' preview mode, standing in
/// for the web's react-markdown pane. Parses with Foundation's markdown
/// support and lays out block intents (headings, lists, quotes, code fences)
/// that `Text` alone won't style.
struct MarkdownView: View {
    let source: String
    @State private var blocks: [MarkdownBlock] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(blocks) { block in
                    view(for: block)
                }
            }
            .modifier(ReadingStyle())
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
        .task(id: source) { blocks = MarkdownBlock.parse(source) }
    }

    @ViewBuilder
    private func view(for block: MarkdownBlock) -> some View {
        switch block.kind {
        case .paragraph:
            Text(block.text)
                .textSelection(.enabled)
        case .heading(let level):
            Text(block.text)
                .font(headingFont(level))
                .accessibilityAddTraits(.isHeader)
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
        case .image(let url):
            MarkdownImage(url: url, alt: String(block.text.characters))
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
