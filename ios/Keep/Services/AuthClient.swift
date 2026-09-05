import Foundation

struct SignInError: LocalizedError {
    let errorDescription: String?
}

/// Establishes a NextAuth session natively — no web view. Drives the same
/// endpoints the web sign-in form posts to (`/api/auth/csrf` →
/// `/api/auth/callback/password`), letting the shared `URLSession` cookie jar
/// capture the resulting session cookie so `KeepAPI` is authenticated. The CSRF
/// cookie/token handshake is handled here; `URLSession` carries the cookies.
actor AuthClient {
    private let session: URLSession
    private let baseURL: URL

    init(session: URLSession = .shared, baseURL: URL = Config.baseURL) {
        self.session = session
        self.baseURL = baseURL
    }

    /// Signs in with email + password. Throws `SignInError` if the credentials
    /// are wrong or the email is unverified (the server fails both the same way).
    func signIn(email: String, password: String) async throws {
        let csrf = try await csrfToken()
        var req = URLRequest(url: url("api/auth/callback/password"))
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = formBody([
            "csrfToken": csrf,
            "email": email,
            "password": password,
            "callbackUrl": baseURL.absoluteString,
            "json": "true",
        ])
        _ = try await session.data(for: req)
        // The callback returns 200 even on bad credentials (with an error in the
        // body), so confirm a real session exists rather than trusting the POST.
        guard try await isSignedIn() else {
            throw SignInError(errorDescription: "Incorrect email or password, or your email isn't verified.")
        }
    }

    /// True when a NextAuth session is currently established.
    func isSignedIn() async throws -> Bool {
        try await userID() != nil
    }

    func userID() async throws -> String? {
        let (data, _) = try await session.data(from: url("api/auth/session"))
        // Authenticated → {"user": {...}, ...}; otherwise `null` or {}.
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return (obj["user"] as? [String: Any])?["id"] as? String
    }

    /// Ends only this device's session — server-side (best effort) and locally.
    /// Revoking every device (POST /api/auth/revoke) is a separate, explicit
    /// action; a plain "Sign out" must not log the user out of their laptop.
    func signOut() async {
        if let csrf = try? await csrfToken() {
            var req = URLRequest(url: url("api/auth/signout"))
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = formBody(["csrfToken": csrf, "json": "true"])
            _ = try? await session.data(for: req)
        }
        session.configuration.httpCookieStorage?.cookies?.forEach {
            session.configuration.httpCookieStorage?.deleteCookie($0)
        }
    }

    // MARK: - Plumbing

    private func csrfToken() async throws -> String {
        struct CSRF: Decodable { let csrfToken: String }
        let (data, _) = try await session.data(from: url("api/auth/csrf"))
        return try JSONDecoder().decode(CSRF.self, from: data).csrfToken
    }

    private func url(_ path: String) -> URL { baseURL.appendingPathComponent(path) }

    /// x-www-form-urlencoded with strict encoding so `+`, `/`, `=` and spaces in
    /// a password survive (URLComponents would leave `+` to be misread as space).
    private func formBody(_ fields: [String: String]) -> Data {
        let allowed = CharacterSet.alphanumerics
        let pairs = fields.map { key, value in
            let k = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
            let v = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
            return "\(k)=\(v)"
        }
        return Data(pairs.joined(separator: "&").utf8)
    }
}
