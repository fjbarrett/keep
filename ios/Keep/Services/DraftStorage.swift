import CryptoKit
import Foundation

/// One atomic file per draft avoids rewriting the entire notebook per edit.
/// Account and backend are both part of the namespace; ownerless files are
/// never adopted by whichever account signs in next.
struct DraftStorage {
    private let root: URL
    private let backend: String

    init(root: URL? = nil, backend: String = Config.baseURL.absoluteString) {
        self.root = root ?? FileManager.default.urls(
            for: .applicationSupportDirectory, in: .userDomainMask
        )[0].appendingPathComponent("KeepDrafts", isDirectory: true)
        self.backend = backend
    }

    private func directory(_ owner: String) -> URL {
        let digest = SHA256.hash(data: Data((backend + "\0" + owner).utf8))
        let name = digest.map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(name, isDirectory: true)
    }

    private func file(_ id: String, owner: String) throws -> URL {
        guard id.count == 32, id.allSatisfy({ $0.isHexDigit }) else {
            throw CocoaError(.fileWriteInvalidFileName)
        }
        return directory(owner).appendingPathComponent(id + ".json")
    }

    func save(_ draft: NoteDraft, owner: String) throws {
        let url = try file(draft.id, owner: owner)
        try FileManager.default.createDirectory(at: directory(owner),
            withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var options: Data.WritingOptions = [.atomic]
        #if os(iOS)
        options.insert(.completeFileProtectionUnlessOpen)
        #endif
        try JSONEncoder().encode(draft).write(to: url, options: options)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    func load(owner: String) throws -> [String: NoteDraft] {
        let folder = directory(owner)
        guard FileManager.default.fileExists(atPath: folder.path) else { return [:] }
        let files = try FileManager.default.contentsOfDirectory(
            at: folder, includingPropertiesForKeys: nil
        ).filter { $0.pathExtension == "json" }
        var drafts: [String: NoteDraft] = [:]
        for url in files {
            let draft = try JSONDecoder().decode(NoteDraft.self, from: Data(contentsOf: url))
            guard try file(draft.id, owner: owner).standardizedFileURL.path == url.standardizedFileURL.path else {
                throw CocoaError(.fileReadCorruptFile)
            }
            drafts[draft.id] = draft
        }
        return drafts
    }

    func remove(_ id: String, owner: String) throws {
        let url = try file(id, owner: owner)
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }
}
