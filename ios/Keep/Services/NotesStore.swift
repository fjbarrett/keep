import AuthenticationServices
import Foundation
import Observation

/// Observable view-model backing the notes UI.
@MainActor
@Observable
final class NotesStore {
    private(set) var notes: [Note] = []
    private(set) var isLoading = false
    var errorMessage: String?
    /// Set when the API returns 401 — RootView presents the sign-in sheet.
    private(set) var needsAuth = false
    private(set) var sessionGeneration = 0
    private var contentGeneration = 0
    private var loadGeneration = 0
    private var authenticationTask: Task<Void, Error>?

    private let api: KeepAPI
    private let auth: AuthClient
    private let google = GoogleSignIn()

    init(api: KeepAPI = KeepAPI(), auth: AuthClient = AuthClient()) {
        self.api = api
        self.auth = auth
    }

    /// Pinned first, then most-recently-updated — matches the web ordering.
    static func inDisplayOrder(_ notes: [Note]) -> [Note] {
        notes.sorted { a, b in
            if a.pinned != b.pinned { return a.pinned }
            return a.updatedAt > b.updatedAt
        }
    }

    /// Case-insensitive AND-match over title and body: every whitespace-separated
    /// token must appear somewhere in the note. Mirrors the Mac client; the web
    /// uses Fuse for fuzzy matching, which isn't worth a dependency here.
    static func matching(_ query: String, in notes: [Note]) -> [Note] {
        let tokens = query.lowercased().split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return notes }
        return notes.filter { note in
            let hay = (note.title + "\n" + note.body).lowercased()
            return tokens.allSatisfy { hay.contains($0) }
        }
    }

    func load() async {
        guard !needsAuth else { return }
        let session = sessionGeneration
        let content = contentGeneration
        loadGeneration += 1
        let request = loadGeneration
        isLoading = true
        defer { if request == loadGeneration { isLoading = false } }
        do {
            let loaded = try await api.listNotes()
            guard session == sessionGeneration, content == contentGeneration,
                  request == loadGeneration else { return }
            notes = loaded
        } catch { if session == sessionGeneration { handle(error) } }
    }

    @discardableResult
    func create(body: String) async -> Note? {
        guard !needsAuth else { return nil }
        let session = sessionGeneration
        contentGeneration += 1
        do {
            let meta = try? await api.generateMeta(body: body)
            guard session == sessionGeneration else { return nil }
            let note = try await api.create(body: body, title: meta?.title, summary: meta?.summary)
            guard session == sessionGeneration else { return nil }
            contentGeneration += 1
            notes.insert(note, at: 0)
            return note
        } catch {
            if session == sessionGeneration { handle(error) }
            return nil
        }
    }

    /// Body saves regenerate the title/summary when the lead line changes (or
    /// the note has no title yet), folded into the same PATCH — mirroring the
    /// web's autosave. Meta failures degrade to a plain body save.
    func update(_ id: String, patch: [String: Any]) async {
        guard !needsAuth else { return }
        let session = sessionGeneration
        contentGeneration += 1
        var patch = patch
        if let body = patch["body"] as? String,
           patch["title"] == nil,
           let current = notes.first(where: { $0.id == id }),
           Self.firstLine(body) != Self.firstLine(current.body)
               || current.title.trimmingCharacters(in: .whitespaces).isEmpty,
           let meta = try? await api.generateMeta(body: body) {
            patch["title"] = meta.title
            if let summary = meta.summary, !summary.isEmpty { patch["summary"] = summary }
        }
        guard session == sessionGeneration else { return }
        do {
            let updated = try await api.update(id: id, patch: patch)
            guard session == sessionGeneration else { return }
            contentGeneration += 1
            if let i = notes.firstIndex(where: { $0.id == id }) { notes[i] = updated }
        } catch { if session == sessionGeneration { handle(error) } }
    }

    private static func firstLine(_ body: String) -> String {
        (body.components(separatedBy: "\n").first ?? "")
            .trimmingCharacters(in: .whitespaces)
    }

    func togglePin(_ note: Note) async {
        await update(note.id, patch: ["pinned": !note.pinned])
    }

    func setArchived(_ note: Note, _ archived: Bool) async {
        await update(note.id, patch: ["archived": archived])
    }

    /// Trashing updates in place rather than dropping the note, so the Trash
    /// view can show it immediately.
    func trash(_ note: Note) async {
        await update(note.id, patch: ["trashed": true])
    }

    func restore(_ note: Note) async {
        await update(note.id, patch: ["trashed": false])
    }

    func deleteForever(_ note: Note) async {
        guard !needsAuth else { return }
        let session = sessionGeneration
        contentGeneration += 1
        do {
            try await api.delete(id: note.id)
            guard session == sessionGeneration else { return }
            contentGeneration += 1
            notes.removeAll { $0.id == note.id }
        } catch { if session == sessionGeneration { handle(error) } }
    }

    func setColor(_ note: Note, to key: String?) async {
        await update(note.id, patch: ["color": key ?? NSNull()])
    }

    /// Ensures the note has a public share link; returns the updated note.
    @discardableResult
    func share(_ note: Note) async -> Note? {
        guard !needsAuth else { return nil }
        let session = sessionGeneration
        contentGeneration += 1
        do {
            let updated = try await api.share(id: note.id)
            guard session == sessionGeneration else { return nil }
            contentGeneration += 1
            if let i = notes.firstIndex(where: { $0.id == note.id }) { notes[i] = updated }
            return updated
        } catch {
            if session == sessionGeneration { handle(error) }
            return nil
        }
    }

    /// Ensures the note has a public link and hands back its URL.
    func shareURL(for note: Note) async -> URL? {
        guard let token = (await share(note))?.shareToken else { return nil }
        return Config.baseURL.appendingPathComponent("p/\(token)")
    }

    func unshare(_ note: Note) async {
        guard !needsAuth else { return }
        let session = sessionGeneration
        contentGeneration += 1
        do {
            let updated = try await api.unshare(id: note.id)
            guard session == sessionGeneration else { return }
            contentGeneration += 1
            if let i = notes.firstIndex(where: { $0.id == note.id }) { notes[i] = updated }
        } catch { if session == sessionGeneration { handle(error) } }
    }

    // MARK: - Auth

    /// Signs in, then reloads. Returns an error message to show, or nil on success.
    func signIn(email: String, password: String) async -> String? {
        let (session, task) = beginAuthentication { [auth] in
            try await auth.signIn(email: email, password: password)
        }
        do {
            try await task.value
            guard session == sessionGeneration else { return nil }
            needsAuth = false
            await load()
            return nil
        } catch {
            return session == sessionGeneration ? error.localizedDescription : nil
        }
    }

    /// Google sign-in via the system browser, then reloads. Returns an error
    /// message to show, or nil on success. A user-cancelled flow returns nil so
    /// it surfaces no error.
    func signInWithGoogle() async -> String? {
        let (session, task) = beginAuthentication { [google] in try await google.signIn() }
        do {
            try await task.value
            guard session == sessionGeneration else { return nil }
            needsAuth = false
            await load()
            return nil
        } catch let error as ASWebAuthenticationSessionError
            where error.code == .canceledLogin {
            return nil
        } catch {
            return session == sessionGeneration ? error.localizedDescription : nil
        }
    }

    func signOut() async {
        let (_, task) = beginAuthentication { [auth] in await auth.signOut() }
        try? await task.value
    }

    // Publish the account boundary before suspending. Serialize cookie-changing
    // operations too: a late sign-out must not erase a newer sign-in's cookie.
    private func beginAuthentication(
        _ operation: @escaping @MainActor () async throws -> Void
    ) -> (Int, Task<Void, Error>) {
        sessionGeneration += 1
        contentGeneration += 1
        loadGeneration += 1
        notes = []
        errorMessage = nil
        isLoading = false
        needsAuth = true
        let previous = authenticationTask
        let task = Task {
            _ = try? await previous?.value
            try await operation()
        }
        authenticationTask = task
        return (sessionGeneration, task)
    }

    /// A 401 means "sign in" (surface the sheet); anything else is a real error.
    private func handle(_ error: Error) {
        if case APIError.unauthorized = error {
            needsAuth = true
        } else {
            errorMessage = error.localizedDescription
        }
    }
}
