import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

/// Indexes notes into Core Spotlight so they turn up in the system search.
/// Selecting a result launches the app with an `NSUserActivity` of type
/// `CSSearchableItemActionType` whose activity identifier is the note id — the
/// app routes that back to the note (see `MacRootView.onContinueUserActivity`).
///
/// Shared by both platforms; the macOS app wires it in today, and iOS can reuse
/// it as-is. Indexing is on-device, which is the right home for private notes —
/// Apple's web crawler only ever sees public pages.
enum SpotlightIndexer {
    static let domain = "note"

    /// Reindex the visible notes. Trashed/archived notes are dropped so search
    /// only surfaces what the app shows. Cheap for a personal-size corpus: it
    /// clears the domain and reindexes, so removed notes fall out too.
    static func sync(_ notes: [Note]) {
        let visible = notes.filter { !$0.trashed && !$0.archived }
        let items = visible.map { note -> CSSearchableItem in
            let attrs = CSSearchableItemAttributeSet(contentType: .text)
            attrs.title = note.displayTitle
            attrs.contentDescription = note.displaySummary ?? snippet(note.body)
            attrs.textContent = note.body
            attrs.keywords = note.tags
            return CSSearchableItem(
                uniqueIdentifier: note.id,
                domainIdentifier: domain,
                attributeSet: attrs
            )
        }
        let index = CSSearchableIndex.default()
        index.deleteSearchableItems(withDomainIdentifiers: [domain]) { _ in
            index.indexSearchableItems(items)
        }
    }

    /// Remove everything this app indexed (e.g. on sign-out).
    static func clear() {
        CSSearchableIndex.default()
            .deleteSearchableItems(withDomainIdentifiers: [domain])
    }

    private static func snippet(_ body: String, limit: Int = 180) -> String {
        let oneLine = body.split(whereSeparator: \.isNewline).joined(separator: " ")
        return oneLine.count > limit ? String(oneLine.prefix(limit)) + "…" : oneLine
    }
}
