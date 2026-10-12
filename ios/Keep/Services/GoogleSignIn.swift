import AuthenticationServices
import Foundation
import CryptoKit
import Security
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Native Google sign-in. Google forbids OAuth inside an embedded web view, so
/// this uses `ASWebAuthenticationSession` (the system browser). Its cookie jar
/// is invisible to the app's `URLSession`, so the web side bridges the session
/// back: `/native/google` runs the same Google flow the web uses and lands on
/// `/native/bridge`, which redirects to `keep://auth-callback?code=…`; this
/// controller trades that one-time code at `/api/native/exchange` for the
/// session cookie, which the shared `URLSession` jar then carries to `/api/notes`.
@MainActor
final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let baseURL: URL
    private let session: URLSession

    /// Custom scheme the bridge redirects to; ASWebAuthenticationSession watches
    /// for it to know sign-in is done. It needs no Info.plist registration —
    /// the auth session claims it for the duration of the flow.
    private let callbackScheme = "keep"

    init(baseURL: URL = Config.baseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func signIn() async throws {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw SignInError(errorDescription: "Couldn't start secure sign-in.")
        }
        let verifier = Self.base64url(Data(bytes))
        let challenge = Self.base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
        var start = URLComponents(url: baseURL.appendingPathComponent("native/google"), resolvingAgainstBaseURL: false)!
        start.queryItems = [URLQueryItem(name: "challenge", value: challenge)]
        let callbackURL = try await authenticate(startURL: start.url!)
        let callback = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
        guard callbackURL.scheme == callbackScheme, callbackURL.host == "auth-callback",
              callback?.queryItems?.first(where: { $0.name == "state" })?.value == challenge,
              let code = code(from: callbackURL) else {
            throw SignInError(errorDescription: "Google sign-in didn't match this request.")
        }
        try await exchange(code: code, verifier: verifier)
    }

    private static func base64url(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    private func authenticate(startURL: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let asSession = ASWebAuthenticationSession(
                url: startURL,
                callbackURLScheme: callbackScheme
            ) { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(
                        throwing: SignInError(errorDescription: "Sign-in was cancelled.")
                    )
                }
            }
            asSession.presentationContextProvider = self
            // Share Safari's cookies so an existing Google login carries over.
            asSession.prefersEphemeralWebBrowserSession = false
            if !asSession.start() {
                continuation.resume(
                    throwing: SignInError(errorDescription: "Couldn't start sign-in.")
                )
            }
        }
    }

    private func code(from url: URL) -> String? {
        URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == "code" }?
            .value
    }

    /// Trades the code for the session cookie. The response's Set-Cookie lands in
    /// the shared cookie storage, authenticating subsequent `KeepAPI` requests.
    private func exchange(code: String, verifier: String) async throws {
        var req = URLRequest(url: baseURL.appendingPathComponent("api/native/exchange"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["code": code, "verifier": verifier])
        let (_, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw SignInError(errorDescription: "Couldn't complete Google sign-in.")
        }
    }

    nonisolated func presentationAnchor(
        for session: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            #if canImport(UIKit)
            let window = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first { $0.isKeyWindow }
            return window ?? ASPresentationAnchor()
            #elseif canImport(AppKit)
            return NSApplication.shared.keyWindow
                ?? NSApplication.shared.windows.first
                ?? ASPresentationAnchor()
            #else
            return ASPresentationAnchor()
            #endif
        }
    }
}
