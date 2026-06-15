import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized
    case http(Int)
    case decoding(Error)
    case transport(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Please sign in."
        case .http(let code): return "Server error (\(code))."
        case .decoding: return "Couldn't read the server response."
        case .transport(let e): return e.localizedDescription
        }
    }
}

/// Thin client over the existing Next.js API (`/api/notes`).
///
/// Auth: the web app uses NextAuth session cookies. This client relies on a
/// shared `URLSession` cookie jar — see `AuthController` for how the session is
/// established (a sign-in WebView is the simplest first step; a token endpoint
/// would be the cleaner long-term option). Endpoints here assume an
/// authenticated session is already present.
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

    func create(body: String) async throws -> Note {
        try await request(
            "/api/notes", method: "POST",
            json: ["body": body],
            as: NoteResponse.self
        ).note
    }

    func update(id: String, patch: [String: Any]) async throws -> Note {
        try await request(
            "/api/notes/\(id)", method: "PATCH",
            json: patch,
            as: NoteResponse.self
        ).note
    }

    func trash(id: String) async throws {
        _ = try await update(id: id, patch: ["trashed": true])
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
