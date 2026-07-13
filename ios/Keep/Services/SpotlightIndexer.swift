import CoreSpotlight
import Foundation
import UniformTypeIdentifiers
import os

/// Indexes notes into Core Spotlight so they turn up in the system search.
/// Selecting a result launches the app with an `NSUserActivity` of type
/// `CSSearchableItemActionType` whose activity identifier is the note id — the
/// app routes that back to the note (see the root view's `onContinueUserActivity`).
///
/// Shared by both platforms. Indexing is on-device, which is the right home for
/// private notes — Apple's web crawler only ever sees public pages.
enum SpotlightIndexer {
    static let domain = "note"
    private static let log = Logger(subsystem: "com.keeptxt.keep", category: "spotlight")

    /// Reindex the visible notes. Trashed/archived notes are dropped so search
    /// only surfaces what the app shows. Logs the outcome (Console.app →
    /// subsystem `com.keeptxt.keep`, category `spotlight`) so it's diagnosable.
    static func sync(_ notes: [Note]) {
        let visible = notes.filter { !$0.trashed && !$0.archived }
        let items = visible.map { note -> CSSearchableItem in
            let attrs = CSSearchableItemAttributeSet(contentType: .text)
            attrs.title = note.displayTitle
            attrs.displayName = note.displayTitle
            // Keep full note bodies out of the system-wide Spotlight database.
            // Titles, optional summaries, and tags are enough to find a note.
            attrs.contentDescription = note.displaySummary
            attrs.textContent = note.displayTitle
            attrs.keywords = note.tags
            let item = CSSearchableItem(
                uniqueIdentifier: note.id,
                domainIdentifier: domain,
                attributeSet: attrs
            )
            item.expirationDate = .distantFuture
            return item
        }

        let index = CSSearchableIndex.default()
        // Clear the domain first so trashed/archived notes fall out, then index
        // the current set. Log both steps; a failure here is otherwise silent.
        index.deleteSearchableItems(withDomainIdentifiers: [domain]) { deleteError in
            if let deleteError {
                log.error("clear failed: \(deleteError.localizedDescription, privacy: .public)")
            }
            index.indexSearchableItems(items) { indexError in
                if let indexError {
                    log.error("index failed: \(indexError.localizedDescription, privacy: .public)")
                } else {
                    log.info("indexed \(items.count, privacy: .public) notes into Spotlight")
                }
            }
        }
    }

    /// Remove everything this app indexed (e.g. on sign-out).
    static func clear() {
        CSSearchableIndex.default()
            .deleteSearchableItems(withDomainIdentifiers: [domain]) { error in
                if let error {
                    log.error("clear failed: \(error.localizedDescription, privacy: .public)")
                }
            }
    }

}
