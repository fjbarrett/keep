/// The renderer moved to `Keep/Views/MarkdownView.swift` so the iOS editor can
/// use it too. This alias keeps the Mac call sites compiling while a parallel
/// session has `MacNoteDetail.swift` open; fold it away once that work lands.
typealias MacMarkdownView = MarkdownView
