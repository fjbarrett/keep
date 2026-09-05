import Foundation
import XCTest

final class DraftStorageTests: XCTestCase {
    private var directory: URL!
    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
    }
    func testDraftSurvivesStorageRecreationAndKeepsStableIdentity() throws {
        let first = DraftStorage(root: directory)
        let id = String(repeating: "a", count: 32)
        try first.save(NoteDraft(id: id, body: "First text"), owner: "A")
        try first.save(NoteDraft(id: id, body: "Latest 日本語 text", revision: 2), owner: "A")
        let restored = try DraftStorage(root: directory).load(owner: "A")
        XCTAssertEqual(restored.count, 1)
        XCTAssertEqual(restored[id]?.body, "Latest 日本語 text")
        XCTAssertEqual(restored[id]?.revision, 2)
    }
    func testAccountsAndBackendsCannotReadEachOthersDrafts() throws {
        let first = DraftStorage(root: directory, backend: "https://one.invalid")
        let second = DraftStorage(root: directory, backend: "https://two.invalid")
        try first.save(NoteDraft(id: String(repeating: "b", count: 32), body: "Private"), owner: "A")
        XCTAssertTrue(try first.load(owner: "B").isEmpty)
        XCTAssertTrue(try second.load(owner: "A").isEmpty)
    }
    func testRemoveAcknowledgedDraftDoesNotRemoveAnotherAccountsCopy() throws {
        let storage = DraftStorage(root: directory)
        let draft = NoteDraft(id: String(repeating: "c", count: 32), body: "Unsaved")
        try storage.save(draft, owner: "A")
        try storage.save(draft, owner: "B")
        try storage.remove(draft.id, owner: "A")
        XCTAssertTrue(try storage.load(owner: "A").isEmpty)
        XCTAssertEqual(try storage.load(owner: "B")[draft.id], draft)
    }
    func testLegacyDraftWithoutTitleStillDecodes() throws {
        let original = NoteDraft(id: String(repeating: "a", count: 32), body: "Legacy body")
        let data = try JSONEncoder().encode(original)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        json.removeValue(forKey: "title")
        let restored = try JSONDecoder().decode(NoteDraft.self,
            from: JSONSerialization.data(withJSONObject: json))
        XCTAssertNil(restored.title)
        XCTAssertEqual(restored.resolvedTitle, "Legacy body")
    }

    func testInvalidIdentityCannotEscapeTheAccountDirectory() {
        let storage = DraftStorage(root: directory)
        XCTAssertThrowsError(try storage.save(NoteDraft(id: "../elsewhere", body: "Text"), owner: "A"))
    }
}
