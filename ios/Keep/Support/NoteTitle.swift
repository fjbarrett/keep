import Foundation

/// Native clients preserve authored titles. Only untitled notes use the
/// body-derived fallback shared with the web's `lib/inferTitle.ts`.
enum NoteTitle {
    private static let wordLimit = 4
    private static let charLimit = 36

    /// Let the view wrap or truncate a title without replacing its contents.
    static func preview(title: String, body: String) -> String {
        let text = trim(collapseWhitespace(title))
        return text.isEmpty ? infer(body, fallback: "(empty)") : text
    }

    /// Mirrors `inferNoteTitle`: first non-empty, non-noise line of the body.
    static func infer(_ body: String, fallback: String = "Untitled text") -> String {
        let normalized = body.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { raw in
                let t = trim(raw)
                return !t.isEmpty
                    && !matches(t, "^```")
                    && !matches(t, "^!\\[.*?\\]\\(.*?\\)$")
            }
            .map(cleanLine)
            .filter { !$0.isEmpty && !matches($0, "(?i)^https?://\\S+$") }

        if let first = lines.first { return trimTitle(first) }

        let compact = cleanLine(normalized.replacingOccurrences(of: "\n", with: " "))
        if !compact.isEmpty { return trimTitle(compact) }

        return fallback
    }

    // MARK: - Helpers

    private static func cleanLine(_ line: String) -> String {
        var cleaned = line
        cleaned = replace(cleaned, "^#{1,6}\\s+", "")
        cleaned = replace(cleaned, "^[-*]\\s+\\[[ xX]\\]\\s+", "")
        cleaned = replace(cleaned, "^[-*•]\\s+", "")
        cleaned = trim(collapseWhitespace(cleaned))
        let stripped = stripMarkdown(cleaned)
        // Cut a title off where an inline checklist begins (web parity).
        if let r = stripped.range(of: "\\s[-*]\\s+\\[[ xX]\\]\\s+", options: .regularExpression),
           stripped.distance(from: stripped.startIndex, to: r.lowerBound) > 0 {
            return trim(String(stripped[..<r.lowerBound]))
        }
        return stripped
    }

    private static func stripMarkdown(_ text: String) -> String {
        var out = text
        out = replace(out, "\\*\\*(.*?)\\*\\*", "$1")
        out = replace(out, "__(.*?)__", "$1")
        out = replace(out, "\\*(.*?)\\*", "$1")
        out = replace(out, "_(.*?)_", "$1")
        out = replace(out, "~~(.*?)~~", "$1")
        out = replace(out, "`([^`]+)`", "$1")
        out = replace(out, "\\[([^\\]]+)\\]\\([^)]+\\)", "$1")
        return out
    }

    private static func trimTitle(_ title: String) -> String {
        let words = title.split(whereSeparator: \.isWhitespace).map(String.init)
        let capped = words.count > wordLimit
            ? words.prefix(wordLimit).joined(separator: " ")
            : title
        if capped.count > charLimit {
            return trim(String(capped.prefix(charLimit - 1))) + "…"
        }
        return capped
    }

    private static func collapseWhitespace(_ s: String) -> String {
        replace(s, "\\s+", " ")
    }

    private static func trim(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func replace(_ s: String, _ pattern: String, _ template: String) -> String {
        s.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
    }

    private static func matches(_ s: String, _ pattern: String) -> Bool {
        s.range(of: pattern, options: .regularExpression) != nil
    }
}
