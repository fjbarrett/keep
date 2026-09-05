import Foundation
import XCTest

@MainActor
final class DraftSaverTests: XCTestCase {
    private var folder: URL!
    private var storage: DraftStorage!
    private let id = String(repeating: "a", count: 32)
    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        storage = DraftStorage(root: folder)
    }
    override func tearDown() async throws {
        if FileManager.default.fileExists(atPath: folder.path) {
            try FileManager.default.removeItem(at: folder)
        }
    }
    private func saver() throws -> DraftSaver {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FixtureProtocol.self]
        let saver = DraftSaver(api: KeepAPI(session: URLSession(configuration: configuration)), storage: storage)
        try saver.activate(owner: "A")
        return saver
    }
    private func note(_ body: String) -> Note {
        try! JSONDecoder().decode(Note.self, from: JSONSerialization.data(withJSONObject: NotesStoreTests.row(body)))
    }

    func testTypingDuringCreateUsesOnePostThenSavesLatestBody() async throws {
        let started = expectation(description: "create starts")
        var first: FixtureProtocol?
        var methods: [String] = []
        FixtureProtocol.respond = { request in
            methods.append(request.request.httpMethod!)
            if methods.count == 1 {
                XCTAssertEqual(request.payload["id"] as? String, self.id)
                XCTAssertEqual(request.payload["ownerId"] as? String, "A")
                first = request; started.fulfill()
            } else {
                XCTAssertEqual(request.payload["body"] as? String, "Latest text")
                XCTAssertEqual(request.payload["expectedUpdatedAt"] as? Double, 1)
                request.reply(["note": NotesStoreTests.row("Latest text")])
            }
        }
        let sut = try saver()
        sut.stage(id: id, body: "First text", base: nil)
        sut.start(id)
        await fulfillment(of: [started], timeout: 2)
        sut.stage(id: id, body: "Latest text", base: nil)
        first?.reply(["note": NotesStoreTests.row("First text")])
        await sut.waitForSave(id)
        XCTAssertEqual(methods, ["POST", "PATCH"])
        XCTAssertTrue(sut.items.isEmpty)
        XCTAssertTrue(try storage.load(owner: "A").isEmpty)
    }

    func testFailedSaveSurvivesRestartAndRetriesWithSameIdentity() async throws {
        FixtureProtocol.respond = { $0.reply(["error": "Unavailable"], status: 503) }
        let sut = try saver()
        sut.stage(id: id, body: "Keep this text", base: note("Original"))
        sut.start(id)
        await sut.waitForSave(id)
        XCTAssertNotNil(sut.errors[id])
        try sut.activate(owner: nil)
        let restored = try saver()
        XCTAssertEqual(restored.items[id]?.body, "Keep this text")
        FixtureProtocol.respond = { $0.reply(["note": NotesStoreTests.row("Keep this text")]) }
        restored.retryAll()
        await restored.waitForSave(id)
        XCTAssertTrue(restored.items.isEmpty)
    }

    func testConflictPreservesDraftAndCanSaveASeparateCopy() async throws {
        FixtureProtocol.respond = { $0.reply(["note": NotesStoreTests.row("Other device")], status: 409) }
        let sut = try saver()
        sut.stage(id: id, body: "My text", base: note("Original"))
        sut.start(id)
        await sut.waitForSave(id)
        XCTAssertEqual(sut.items[id]?.body, "My text")
        XCTAssertNotNil(sut.errors[id])
        FixtureProtocol.respond = { request in
            var row = NotesStoreTests.row("My text")
            row["id"] = request.payload["id"]
            request.reply(["note": row])
        }
        let copy = try XCTUnwrap(sut.saveCopy(id))
        XCTAssertNotEqual(copy, id)
        await sut.waitForSave(copy)
        XCTAssertTrue(sut.items.isEmpty)
    }

    func testMetadataChangeRetriesBodyAgainstNewVersion() async throws {
        var requests = 0
        FixtureProtocol.respond = { request in
            requests += 1
            var row = NotesStoreTests.row(requests == 1 ? "Original" : "My text")
            row["updatedAt"] = 2
            row["pinned"] = true
            if requests == 2 { XCTAssertEqual(request.payload["expectedUpdatedAt"] as? Double, 2) }
            request.reply(["note": row], status: requests == 1 ? 409 : 200)
        }
        let sut = try saver()
        sut.stage(id: id, body: "My text", base: note("Original"))
        sut.start(id)
        await sut.waitForSave(id)
        XCTAssertEqual(requests, 2)
        XCTAssertTrue(sut.items.isEmpty)
        XCTAssertTrue(sut.errors.isEmpty)
    }

    func testPauseWaitsForCreateAndDiscardStopsLaterDraftSaves() async throws {
        let started = expectation(description: "create starts")
        var pending: FixtureProtocol?
        var methods: [String] = []
        FixtureProtocol.respond = { request in
            methods.append(request.request.httpMethod!)
            pending = request; started.fulfill()
        }
        let sut = try saver()
        sut.stage(id: id, body: "First text", base: nil)
        sut.start(id)
        await fulfillment(of: [started], timeout: 2)
        let paused = Task { await sut.pause(id) }
        await Task.yield()
        sut.stage(id: id, body: "Typed during delete", base: nil)
        pending?.reply(["note": NotesStoreTests.row("First text")])
        await paused.value
        try sut.discard(id)
        sut.resume(id)
        sut.retryAll()
        await sut.waitForSave(id)
        XCTAssertEqual(methods, ["POST"])
        XCTAssertTrue(sut.items.isEmpty)
        XCTAssertTrue(try storage.load(owner: "A").isEmpty)
    }

    func testChangedLeadLineUpdatesTitleWithoutWaitingForMetadata() async throws {
        FixtureProtocol.respond = { request in
            XCTAssertEqual(request.request.httpMethod, "PATCH")
            XCTAssertEqual(request.payload["title"] as? String, "New heading")
            XCTAssertTrue(request.payload["summary"] is NSNull)
            request.reply(["note": NotesStoreTests.row("New heading\nBody")])
        }
        let sut = try saver()
        sut.stage(id: id, body: "New heading\nBody", base: note("Original\nBody"))
        sut.start(id)
        await sut.waitForSave(id)
        XCTAssertTrue(sut.items.isEmpty)
    }

    func testTitleChangesDuringCreateKeepLatestTitleAndEmptyBody() async throws {
        let started = expectation(description: "create starts")
        var first: FixtureProtocol?
        var methods: [String] = []
        FixtureProtocol.respond = { request in
            methods.append(request.request.httpMethod!)
            if methods.count == 1 {
                XCTAssertEqual(request.payload["title"] as? String, "First title")
                first = request; started.fulfill()
            } else {
                XCTAssertEqual(request.payload["title"] as? String, "Chosen title")
                XCTAssertEqual(request.payload["body"] as? String, "")
                var row = NotesStoreTests.row("")
                row["title"] = "Chosen title"
                request.reply(["note": row])
            }
        }
        let sut = try saver()
        sut.stage(id: id, body: "", base: nil, title: "First title")
        sut.start(id)
        await fulfillment(of: [started], timeout: 2)
        sut.stage(id: id, body: "", base: nil, title: "Chosen title")
        var row = NotesStoreTests.row("")
        row["title"] = "First title"
        first?.reply(["note": row])
        await sut.waitForSave(id)
        XCTAssertEqual(methods, ["POST", "PATCH"])
        XCTAssertTrue(sut.items.isEmpty)
    }

    func testExplicitTitleSurvivesRestartAndChangedBodyHeading() async throws {
        FixtureProtocol.respond = { $0.reply(["error": "Unavailable"], status: 503) }
        let sut = try saver()
        sut.stage(id: id, body: "New heading", base: note("Original"), title: "My title")
        sut.start(id)
        await sut.waitForSave(id)
        try sut.activate(owner: nil)
        let restored = try saver()
        XCTAssertEqual(restored.items[id]?.snapshot.title, "My title")
        FixtureProtocol.respond = { request in
            XCTAssertEqual(request.payload["title"] as? String, "My title")
            XCTAssertEqual(request.payload["body"] as? String, "New heading")
            var row = NotesStoreTests.row("New heading")
            row["title"] = "My title"
            request.reply(["note": row])
        }
        restored.retryAll()
        await restored.waitForSave(id)
        XCTAssertTrue(restored.items.isEmpty)
    }

    func testRemoteTitleConflictKeepsLocalTitleAndCopiesIt() async throws {
        FixtureProtocol.respond = { request in
            var row = NotesStoreTests.row("Same body")
            row["title"] = "Other device title"
            row["updatedAt"] = 2
            request.reply(["note": row], status: 409)
        }
        let sut = try saver()
        sut.stage(id: id, body: "Same body", base: note("Same body"), title: "My title")
        sut.start(id)
        await sut.waitForSave(id)
        XCTAssertEqual(sut.items[id]?.title, "My title")
        XCTAssertNotNil(sut.errors[id])
        FixtureProtocol.respond = { request in
            XCTAssertEqual(request.payload["title"] as? String, "My title")
            var row = NotesStoreTests.row("Same body")
            row["id"] = request.payload["id"]
            row["title"] = "My title"
            request.reply(["note": row])
        }
        let copy = try XCTUnwrap(sut.saveCopy(id))
        await sut.waitForSave(copy)
        XCTAssertTrue(sut.items.isEmpty)
    }

    func testLateAcknowledgementCannotPublishIntoAnotherAccount() async throws {
        let started = expectation(description: "save starts")
        var first: FixtureProtocol?
        FixtureProtocol.respond = { first = $0; started.fulfill() }
        let sut = try saver()
        var published = 0
        sut.onSaved = { _ in published += 1 }
        sut.stage(id: id, body: "Private A text", base: nil)
        sut.start(id)
        await fulfillment(of: [started], timeout: 2)
        try sut.activate(owner: "B")
        first?.reply(["note": NotesStoreTests.row("Private A text")])
        await Task.yield()
        XCTAssertEqual(published, 0)
        XCTAssertTrue(sut.items.isEmpty)
        XCTAssertEqual(try storage.load(owner: "A")[id]?.body, "Private A text")
    }
}
