import Foundation
import XCTest

final class NoteImageTests: XCTestCase {
    func testUsesConfiguredTransportAndAvoidsCachedAuthenticatedResponses() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FixtureProtocol.self]
        FixtureProtocol.respond = { request in
            XCTAssertEqual(request.request.url?.path, "/api/uploads/image")
            XCTAssertEqual(request.request.cachePolicy, .reloadIgnoringLocalCacheData)
            let response = HTTPURLResponse(url: request.request.url!, statusCode: 200,
                httpVersion: nil, headerFields: ["Content-Type": "image/png"])!
            request.client?.urlProtocol(request, didReceive: response, cacheStoragePolicy: .notAllowed)
            request.client?.urlProtocol(request, didLoad: Data(base64Encoded:
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")!)
            request.client?.urlProtocolDidFinishLoading(request)
        }
        let api = KeepAPI(session: URLSession(configuration: configuration))
        let image = try await api.image(URL(string: "/api/uploads/image")!)
        XCTAssertEqual(image.width, 1)
        XCTAssertEqual(image.height, 1)
    }

    func testRejectsLocalFileURLsWithoutLoadingThem() async throws {
        let api = KeepAPI()
        do {
            _ = try await api.image(URL(fileURLWithPath: "/private/fixture.png"))
            XCTFail("Local files must not load from Markdown")
        } catch APIError.http(400) { }
    }
}
