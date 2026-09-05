import SwiftUI
import UIKit

/// Keeps padding inside the scrollable text, so controls can float over its viewport.
struct NoteBodyTextView: UIViewRepresentable {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AppStorage("readingTextSize") private var textSize = 0
    @AppStorage("readingLineSpacing") private var lineSpacing = 0.0
    @Binding var text: String
    @Binding var isFocused: Bool
    var topInset: CGFloat
    @Binding var titleScrollOffset: CGFloat

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        view.isOpaque = false
        view.alwaysBounceVertical = true
        view.keyboardType = .asciiCapable
        view.autocorrectionType = .no
        view.adjustsFontForContentSizeCategory = true
        view.accessibilityLabel = "Note body"
        view.accessibilityHint = "Edit or add text. Changes save automatically."
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        coordinator.isUpdating = true
        defer { coordinator.isUpdating = false }

        view.isEditable = isEnabled
        let insets = UIEdgeInsets(top: topInset, left: 0, bottom: 52, right: 0)
        if view.textContainerInset != insets { view.textContainerInset = insets }
        let style: UIFont.TextStyle = textSize == 2 ? .title2 : textSize == 1 ? .title3 : .body
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
        let font = UIFont.preferredFont(forTextStyle: style, compatibleWith: traits)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = lineSpacing
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font, .foregroundColor: UIColor.label, .paragraphStyle: paragraph
        ]
        if view.text != text {
            let selection = view.selectedRange
            view.attributedText = NSAttributedString(string: text, attributes: attributes)
            let length = (text as NSString).length
            view.selectedRange = NSRange(location: min(selection.location, length), length: 0)
        } else if coordinator.font != font || coordinator.lineSpacing != lineSpacing {
            view.textStorage.addAttributes(attributes, range: NSRange(location: 0, length: view.textStorage.length))
        }
        view.typingAttributes = attributes
        coordinator.font = font
        coordinator.lineSpacing = lineSpacing

        if isFocused && !view.isFirstResponder && view.window != nil {
            view.becomeFirstResponder()
        } else if !isFocused && view.isFirstResponder {
            view.resignFirstResponder()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: NoteBodyTextView
        var isUpdating = false
        var font: UIFont?
        var lineSpacing: Double?

        init(_ parent: NoteBodyTextView) { self.parent = parent }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            if !isUpdating { parent.isFocused = true }
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            if !isUpdating { parent.isFocused = false }
        }

        func scrollViewDidScroll(_ scrollView: UIScrollView) {
            guard !isUpdating else { return }
            let offset = min(32, max(0, scrollView.contentOffset.y + scrollView.adjustedContentInset.top))
            if parent.titleScrollOffset != offset { parent.titleScrollOffset = offset }
        }
    }
}
