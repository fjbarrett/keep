import XCTest

final class NoteTitleTests: XCTestCase {
    func testBoundedTitleMatchesServerUnitsWithoutSplittingCharacters() {
        XCTAssertEqual(NoteTitle.bounded(String(repeating: "a", count: 130)).count, 120)
        let emoji = NoteTitle.bounded(String(repeating: "👩🏽‍💻", count: 40))
        XCTAssertLessThanOrEqual(emoji.utf16.count, 120)
        XCTAssertFalse(emoji.contains("�"))
    }

    func testAuthoredTitleIsNotReplacedWhenBodyChanges() {
        let title = "Research notes for a calmer, more accessible writing experience"
        for body in ["", "B", "A completely different first line", title] {
            XCTAssertEqual(NoteTitle.preview(title: title, body: body), title)
        }
    }

    func testMissingTitleStillUsesReadableMarkdownFallback() {
        XCTAssertEqual(NoteTitle.preview(title: " \n ", body: "# My **reading** list"), "My reading list")
        XCTAssertEqual(NoteTitle.preview(title: "", body: ""), "(empty)")
    }

    func testUnicodeTitleAndWordsSurviveDisplayNormalization() {
        XCTAssertEqual(NoteTitle.preview(title: "  東京 — notes\nfor next week  ", body: "Other text"),
                       "東京 — notes for next week")
    }
}
