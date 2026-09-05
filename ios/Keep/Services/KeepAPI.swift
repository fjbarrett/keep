import Foundation
import ImageIO

enum APIError: Error, LocalizedError {
    case unauthorized
    case http(Int)
    case decoding(Error)
    case transport(Error)
    case conflict(Note)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Please sign in."
        case .http(let code): return "Server error (\(code))."
        case .decoding: return "Couldn't read the server response."
        case .transport(let e): return e.localizedDescription
        case .conflict: return "This note changed elsewhere. Your draft is kept on this device."
        }
    }
}

/// Thin client over the existing Next.js API (`/api/notes`).
///
/// Auth: the web app uses NextAuth session cookies. This client relies on the
/// shared `URLSession` cookie jar — `AuthClient` signs in natively against the
/// NextAuth endpoints (no web view) and the resulting session cookie is sent
/// automatically here. A 401 surfaces as `.unauthorized`, which `NotesStore`
/// turns into the sign-in sheet.
actor KeepAPI {
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    func listNotes() async throws -> [Note] {
        try await request("/api/notes", method: "GET", as: NotesResponse.self).notes
    }

    func create(body: String, title: String? = nil, summary: String? = nil,
                id: String? = nil, ownerID: String? = nil) async throws -> Note {
        var json: [String: Any] = ["body": body]
        if let id { json["id"] = id }
        if let ownerID { json["ownerId"] = ownerID }
        if let title { json["title"] = title }
        if let summary, !summary.isEmpty { json["summary"] = summary }
        return try await request(
            "/api/notes", method: "POST",
            json: json,
            as: NoteResponse.self
        ).note
    }

    func generateMeta(body: String) async throws -> NoteMeta {
        try await request(
            "/api/notes/title", method: "POST",
            json: ["body": body],
            as: NoteMeta.self
        )
    }

    func update(id: String, patch: [String: Any]) async throws -> Note {
        try await request(
            "/api/notes/\(id)", method: "PATCH",
            json: patch,
            as: NoteResponse.self
        ).note
    }

    func delete(id: String) async throws {
        _ = try await request("/api/notes/\(id)", method: "DELETE", as: OkResponse.self)
    }

    /// Mints a public share token (or returns the existing one — the server
    /// COALESCEs) for the note.
    func share(id: String) async throws -> Note {
        try await request("/api/notes/\(id)/share", method: "POST", as: NoteResponse.self).note
    }

    func unshare(id: String) async throws -> Note {
        try await request("/api/notes/\(id)/share", method: "DELETE", as: NoteResponse.self).note
    }

    /// Downsample away from the main actor; never reuse an authenticated cached response.
    func image(_ source: URL) async throws -> CGImage {
        guard let url = URL(string: source.relativeString, relativeTo: Config.baseURL)?.absoluteURL,
              ["https", "http"].contains(url.scheme?.lowercased() ?? "") else { throw APIError.http(400) }
        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.http((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        guard data.count <= 16 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048,
                kCGImageSourceCreateThumbnailWithTransform: true,
              ] as CFDictionary) else { throw APIError.http(415) }
        return image
    }

    // MARK: - Plumbing

    private func request<T: Decodable>(
        _ path: String,
        method: String,
        json: [String: Any]? = nil,
        as type: T.Type
    ) async throws -> T {
        var req = URLRequest(url: Config.baseURL.appendingPathComponent(path))
        req.httpMethod = method
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else { throw APIError.http(-1) }
            if http.statusCode == 401 { throw APIError.unauthorized }
            if http.statusCode == 409, let conflict = try? decoder.decode(NoteResponse.self, from: data) {
                throw APIError.conflict(conflict.note)
            }
            guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
            do { return try decoder.decode(T.self, from: data) }
            catch { throw APIError.decoding(error) }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.transport(error)
        }
    }
}
