import XCTest

final class NoteExportTests: XCTestCase {
    func testBothFormatsPreserveExactUTF8Body() {
        let body = "# 東京 👩🏽‍💻\r\n\r\n- [ ] **Keep**  \n\tIndented\n"
        for format in NoteExport.Format.allCases {
            let export = NoteExport(title: "Research", body: body, format: format)
            XCTAssertEqual(export.document.data, Data(body.utf8))
            XCTAssertEqual(export.filename, "Research." + format.rawValue)
            XCTAssertTrue(format.contentType.conforms(to: .plainText))
            XCTAssertEqual(format.contentType.preferredFilenameExtension, format.rawValue)
        }
    }

    func testFilenameIsAVisibleSingleComponentWithAUnicodeTitle() {
        let export = NoteExport(title: "../Plans/東京:\nnext\\week?*", body: "", format: .markdown)
        XCTAssertEqual(export.filename, "Plans 東京 next week.md")
        XCTAssertEqual(URL(fileURLWithPath: export.filename).lastPathComponent, export.filename)
    }

    func testUntitledAndInvalidTitlesHaveUsableNames() {
        XCTAssertEqual(NoteExport(title: " \n", body: "# Reading list", format: .text).filename, "Reading list.txt")
        XCTAssertEqual(NoteExport(title: "../\\:*?", body: "", format: .text).filename, "Note.txt")
        XCTAssertEqual(NoteExport(title: "", body: "", format: .markdown).filename, "Note.md")
    }

    func testLongUnicodeFilenamesStayWithinByteLimits() {
        let export = NoteExport(title: String(repeating: "👩🏽‍💻", count: 100), body: "", format: .markdown)
        XCTAssertLessThanOrEqual(export.filename.utf8.count, 183)
        XCTAssertTrue(export.filename.hasSuffix("👩🏽‍💻.md"))
    }

}
