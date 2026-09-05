import Foundation
import Observation

/// Debouncing belongs here, separately from network work. Once a request has
/// started, further typing updates the durable draft without cancelling it.
@MainActor
@Observable
final class DraftSaver {
    private(set) var items: [String: NoteDraft] = [:]
    private(set) var errors: [String: String] = [:]
    private(set) var saving: Set<String> = []
    var onSaved: (Note) -> Void = { _ in }
    var onUnauthorized: () -> Void = {}

    private let api: KeepAPI
    private let storage: DraftStorage
    private var owner: String?
    private var generation = 0
    private var paused: Set<String> = []
    private var timers: [String: Task<Void, Never>] = [:]
    private var workers: [String: Task<Void, Never>] = [:]

    init(api: KeepAPI, storage: DraftStorage = DraftStorage()) {
        self.api = api
        self.storage = storage
    }

    func activate(owner: String?) throws {
        guard owner != self.owner else { return }
        generation += 1
        timers.values.forEach { $0.cancel() }
        timers = [:]
        workers = [:]
        paused = []
        saving = []
        errors = [:]
        items = [:]
        self.owner = nil
        if let owner { items = try storage.load(owner: owner) }
        self.owner = owner
    }

    func stage(id: String, body: String, base: Note?, title: String? = nil) {
        guard let owner else { return }
        let previous = items[id]
        let draft = NoteDraft(id: id, body: body, base: previous == nil ? base : previous!.base,
                              revision: (previous?.revision ?? 0) + 1, title: title ?? previous?.title)
        items[id] = draft
        do {
            try storage.save(draft, owner: owner)
            errors[id] = nil
        } catch {
            errors[id] = "Could not keep this draft on this device: " + error.localizedDescription
            return
        }
        timers[id]?.cancel()
        timers[id] = Task {
            do { try await Task.sleep(for: .milliseconds(600)) } catch { return }
            start(id)
        }
    }

    func start(_ id: String) {
        guard !paused.contains(id), workers[id] == nil, items[id] != nil, let owner else { return }
        timers[id]?.cancel()
        timers[id] = nil
        let session = generation
        saving.insert(id)
        errors[id] = nil
        workers[id] = Task {
            defer {
                if session == generation { workers[id] = nil; saving.remove(id) }
            }
            while session == generation, !paused.contains(id), let draft = items[id] {
                do {
                    // Retry a failed disk write before any network request.
                    try storage.save(draft, owner: owner)
                    let saved: Note
                    do {
                        if let base = draft.base {
                            var patch: [String: Any] = ["body": draft.body, "expectedUpdatedAt": base.updatedAt]
                            if draft.title != nil {
                                patch["title"] = draft.resolvedTitle
                                if draft.body.components(separatedBy: "\n").first != base.body.components(separatedBy: "\n").first {
                                    patch["summary"] = NSNull()
                                }
                            } else if draft.body.components(separatedBy: "\n").first != base.body.components(separatedBy: "\n").first
                                || base.title.trimmingCharacters(in: .whitespaces).isEmpty {
                                patch["title"] = NoteTitle.infer(draft.body)
                                patch["summary"] = NSNull()
                            }
                            saved = try await api.update(id: id, patch: patch)
                        } else {
                            saved = try await api.create(body: draft.body, title: draft.resolvedTitle,
                                                         id: id, ownerID: owner)
                        }
                    } catch APIError.conflict(let remote) where draft.matches(remote) {
                        // The previous request committed but its acknowledgement was lost.
                        saved = remote
                    }
                    guard session == generation, var current = items[id] else { return }
                    if current.revision == draft.revision, current.matches(saved) {
                        try storage.remove(id, owner: owner)
                        items[id] = nil
                    } else {
                        current.base = saved
                        try storage.save(current, owner: owner)
                        items[id] = current
                    }
                    onSaved(saved)
                } catch {
                    guard session == generation else { return }
                    if case APIError.conflict(let remote) = error {
                        onSaved(remote)
                        if remote.body == draft.base?.body,
                           draft.title == nil || remote.title == draft.base?.title || remote.title == draft.resolvedTitle,
                           remote.updatedAt != draft.base?.updatedAt,
                           var current = items[id] {
                            // A flag/title change does not conflict with our body edit.
                            current.base = remote
                            do { try storage.save(current, owner: owner); items[id] = current; continue }
                            catch { errors[id] = error.localizedDescription; return }
                        }
                    }
                    if case APIError.unauthorized = error { onUnauthorized() }
                    errors[id] = error.localizedDescription
                    return
                }
            }
        }
    }

    /// Wait for committed network work before a permanent delete can begin.
    func pause(_ id: String) async {
        paused.insert(id)
        timers[id]?.cancel()
        timers[id] = nil
        await workers[id]?.value
    }

    func resume(_ id: String) { paused.remove(id) }

    func discard(_ id: String) throws {
        guard let owner else { return }
        try storage.remove(id, owner: owner)
        timers[id]?.cancel()
        timers[id] = nil
        items[id] = nil
        errors[id] = nil
    }

    func retryAll() {
        for id in items.keys { start(id) }
    }

    func waitForSave(_ id: String) async {
        await workers[id]?.value
    }

    /// Preserve both versions when a remote edit conflicts with this draft.
    @discardableResult
    func saveCopy(_ id: String) -> String? {
        guard workers[id] == nil, let owner, let draft = items[id] else { return nil }
        let copy = NoteDraft(id: UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased(),
                             body: draft.body, title: draft.title)
        do {
            try storage.save(copy, owner: owner)
            try storage.remove(id, owner: owner)
            items[id] = nil
            errors[id] = nil
            items[copy.id] = copy
            start(copy.id)
            return copy.id
        } catch {
            errors[id] = error.localizedDescription
            return nil
        }
    }
}
