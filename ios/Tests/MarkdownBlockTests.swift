import Foundation
import XCTest

final class MarkdownBlockTests: XCTestCase {
    func testImagesKeepAltTextAndSurroundingParagraphOrder() {
        let blocks = MarkdownBlock.parse("Before ![Receipt](https://example.invalid/receipt.png) after")
        XCTAssertEqual(blocks.map { String($0.text.characters) }, ["Before ", "Receipt", " after"])
        guard case .image(let url) = blocks[1].kind else { return XCTFail("Expected image block") }
        XCTAssertEqual(url.absoluteString, "https://example.invalid/receipt.png")
    }
    func testHeadingsCodeAndRelativeImageURLsRemainDistinct() {
        let blocks = MarkdownBlock.parse("# Title\n\n![Alt](/api/uploads/a)\n\n```\n![literal](x)\n```")
        guard case .heading(1) = blocks[0].kind else { return XCTFail("Expected heading") }
        guard case .image(let url) = blocks[1].kind else { return XCTFail("Expected relative image") }
        XCTAssertEqual(url.relativeString, "/api/uploads/a")
        guard case .code = blocks[2].kind else { return XCTFail("Code must stay literal") }
    }
}
