import Foundation
import XCTest

final class FixtureProtocol: URLProtocol, @unchecked Sendable {
    static var respond: (FixtureProtocol) -> Void = { _ in }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.respond(self) }
    override func stopLoading() {}
    var payload: [String: Any] {
        var data = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var bytes = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&bytes, maxLength: bytes.count)
                if count <= 0 { break }
                data.append(contentsOf: bytes.prefix(count))
            }
        }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    }
    func reply(_ value: Any, status: Int = 200) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status,
                                       httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: value))
        client?.urlProtocolDidFinishLoading(self)
    }
}

@MainActor
final class NotesStoreTests: XCTestCase {
    static let id = String(repeating: "a", count: 32)
    static func row(_ body: String) -> [String: Any] {
        ["id": id, "title": "Heading", "body": body, "pinned": false,
         "archived": false, "trashed": false, "markdown": false, "highlight": false,
         "tags": [], "createdAt": 1, "updatedAt": 1]
    }
    func store() -> NotesStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FixtureProtocol.self]
        let session = URLSession(configuration: configuration)
        return NotesStore(api: KeepAPI(session: session), auth: AuthClient(session: session))
    }

    func testOldAccountReadCannotAppearAfterNewSignIn() async {
        let started = expectation(description: "old read starts")
        var old: FixtureProtocol?
        var loads = 0
        FixtureProtocol.respond = { request in
            switch request.request.url!.path {
            case "/api/notes":
                loads += 1
                if loads == 1 { old = request; started.fulfill() }
                else { request.reply(["notes": [Self.row("Account B")]]) }
            case "/api/auth/csrf": request.reply(["csrfToken": "fixture"])
            case "/api/auth/session": request.reply(["user": ["id": "B"]])
            default: request.reply(["ok": true])
            }
        }
        let sut = store()
        let read = Task { await sut.load() }
        await fulfillment(of: [started], timeout: 2)
        await sut.signOut()
        _ = await sut.signIn(email: "b@example.invalid", password: "fixture")
        XCTAssertEqual(sut.notes.first?.body, "Account B")
        old?.reply(["notes": [Self.row("Private account A")]])
        await read.value
        XCTAssertEqual(sut.notes.first?.body, "Account B")
        XCTAssertFalse(sut.needsAuth)
    }

    func testSlowRefreshCannotReplaceSuccessfulEdit() async {
        let started = expectation(description: "refresh starts")
        var old: FixtureProtocol?
        var loads = 0
        FixtureProtocol.respond = { request in
            if request.request.url!.path.hasSuffix("/session") {
                request.reply(["user": ["id": "A"]]); return
            }
            if request.request.httpMethod == "PATCH" {
                request.reply(["note": Self.row("Heading\nSaved edit")])
            } else {
                loads += 1
                if loads == 1 { request.reply(["notes": [Self.row("Heading\nOriginal")]]) }
                else { old = request; started.fulfill() }
            }
        }
        let sut = store()
        await sut.load()
        let refresh = Task { await sut.load() }
        await fulfillment(of: [started], timeout: 2)
        await sut.update(Self.id, patch: ["body": "Heading\nSaved edit"])
        old?.reply(["notes": [Self.row("Heading\nOriginal")]])
        await refresh.value
        XCTAssertEqual(sut.notes.first?.body, "Heading\nSaved edit")
    }

    func testFailedDraftCanBeExportedWithoutDiscardingEitherVersion() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FixtureProtocol.self]
        let session = URLSession(configuration: configuration)
        let sut = NotesStore(api: KeepAPI(session: session), auth: AuthClient(session: session),
                             draftStorage: DraftStorage(root: folder))
        FixtureProtocol.respond = { request in
            if request.request.url?.path == "/api/auth/session" {
                request.reply(["user": ["id": "export-owner"]])
            } else if request.request.httpMethod == "PATCH" {
                request.reply(["error": "Offline fixture"], status: 503)
            } else { request.reply(["notes": [Self.row("Server copy")]]) }
        }
        await sut.load()
        sut.drafts.stage(id: Self.id, body: "Latest draft 👩🏽‍💻\n", base: sut.notes.first, title: "Draft title")
        sut.drafts.start(Self.id)
        await sut.drafts.waitForSave(Self.id)
        XCTAssertNotNil(sut.drafts.errors[Self.id])
        let visible = try XCTUnwrap(sut.visibleNotes.first)
        let export = NoteExport(title: visible.title, body: visible.body, format: .markdown)
        XCTAssertEqual(export.filename, "Draft title.md")
        XCTAssertEqual(export.document.data, Data("Latest draft 👩🏽‍💻\n".utf8))
        XCTAssertEqual(sut.notes.first?.body, "Server copy")
        XCTAssertEqual(try DraftStorage(root: folder).load(owner: "export-owner")[Self.id]?.body,
                       "Latest draft 👩🏽‍💻\n")
    }

    func testPermanentDeleteWaitsForCreateAndRemovesItsDurableDraft() async throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FixtureProtocol.self]
        let session = URLSession(configuration: configuration)
        let sut = NotesStore(api: KeepAPI(session: session), auth: AuthClient(session: session),
                             draftStorage: DraftStorage(root: folder))
        let started = expectation(description: "create starts")
        var pending: FixtureProtocol?
        var replied = false
        FixtureProtocol.respond = { request in
            if request.request.url?.path == "/api/auth/session" {
                request.reply(["user": ["id": "A"]])
            } else if request.request.httpMethod == "POST" {
                pending = request; started.fulfill()
            } else if request.request.httpMethod == "DELETE" {
                XCTAssertTrue(replied, "Delete must follow the create acknowledgement")
                request.reply(["ok": true])
            } else { request.reply(["notes": []]) }
        }
        await sut.load()
        sut.drafts.stage(id: Self.id, body: "New note", base: nil)
        let draft = try XCTUnwrap(sut.visibleNotes.first)
        sut.drafts.start(Self.id)
        await fulfillment(of: [started], timeout: 2)
        let deleting = Task { await sut.deleteForever(draft) }
        await Task.yield()
        replied = true
        pending?.reply(["note": Self.row("New note")])
        await deleting.value
        XCTAssertTrue(sut.visibleNotes.isEmpty)
        XCTAssertTrue(try DraftStorage(root: folder).load(owner: "A").isEmpty)
    }

    func testSignOutClearsImmediatelyAndNewSignInWaitsForCookieCleanup() async {
        let started = expectation(description: "sign-out starts")
        var signOut: FixtureProtocol?
        var passwordRequests = 0
        FixtureProtocol.respond = { request in
            switch request.request.url!.path {
            case "/api/auth/signout": signOut = request; started.fulfill()
            case "/api/auth/callback/password":
                passwordRequests += 1; request.reply(["ok": true])
            case "/api/auth/csrf": request.reply(["csrfToken": "fixture"])
            case "/api/auth/session": request.reply(["user": ["id": "B"]])
            default: request.reply(["notes": [Self.row("Heading")]])
            }
        }
        let sut = store()
        await sut.load()
        let leaving = Task { await sut.signOut() }
        await fulfillment(of: [started], timeout: 2)
        XCTAssertTrue(sut.notes.isEmpty)
        let entering = Task { await sut.signIn(email: "b@example.invalid", password: "fixture") }
        await Task.yield()
        XCTAssertEqual(passwordRequests, 0)
        signOut?.reply(["ok": true])
        await leaving.value
        let error = await entering.value
        XCTAssertNil(error)
        XCTAssertEqual(passwordRequests, 1)
        XCTAssertFalse(sut.needsAuth)
    }
}
