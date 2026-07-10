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

    private let api: KeepAPI
    private let auth: AuthClient
    private let google = GoogleSignIn()

    init(api: KeepAPI = KeepAPI(), auth: AuthClient = AuthClient()) {
        self.api = api
        self.auth = auth
    }

    /// Pinned first, then most-recently-updated — matches the web ordering.
    var sorted: [Note] {
        notes
            .filter { !$0.trashed && !$0.archived }
            .sorted { a, b in
                if a.pinned != b.pinned { return a.pinned }
                return a.updatedAt > b.updatedAt
            }
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do { notes = try await api.listNotes() }
        catch { handle(error) }
    }

    @discardableResult
    func create(body: String) async -> Note? {
        do {
            let note = try await api.create(body: body)
            notes.insert(note, at: 0)
            return note
        } catch {
            handle(error)
            return nil
        }
    }

    func update(_ id: String, patch: [String: Any]) async {
        do {
            let updated = try await api.update(id: id, patch: patch)
            if let i = notes.firstIndex(where: { $0.id == id }) { notes[i] = updated }
        } catch { handle(error) }
    }

    func togglePin(_ note: Note) async {
        await update(note.id, patch: ["pinned": !note.pinned])
    }

    func trash(_ note: Note) async {
        do {
            try await api.trash(id: note.id)
            notes.removeAll { $0.id == note.id }
        } catch { handle(error) }
    }

    // MARK: - Auth

    /// Signs in, then reloads. Returns an error message to show, or nil on success.
    func signIn(email: String, password: String) async -> String? {
        do {
            try await auth.signIn(email: email, password: password)
            needsAuth = false
            await load()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    /// Google sign-in via the system browser, then reloads. Returns an error
    /// message to show, or nil on success. A user-cancelled flow returns nil so
    /// it surfaces no error.
    func signInWithGoogle() async -> String? {
        do {
            try await google.signIn()
            needsAuth = false
            await load()
            return nil
        } catch let error as ASWebAuthenticationSessionError
            where error.code == .canceledLogin {
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func signOut() async {
        await auth.signOut()
        notes = []
        needsAuth = true
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
