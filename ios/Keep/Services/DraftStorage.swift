import CryptoKit
import Foundation
import os

/// One atomic file per draft avoids rewriting the entire notebook per edit.
/// Account and backend are both part of the namespace; ownerless files are
/// never adopted by whichever account signs in next.
struct DraftStorage {
    private static let log = Logger(subsystem: "com.keeptxt.keep", category: "drafts")
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
            do {
                let draft = try JSONDecoder().decode(NoteDraft.self, from: Data(contentsOf: url))
                guard try file(draft.id, owner: owner).standardizedFileURL.path == url.standardizedFileURL.path else {
                    throw CocoaError(.fileReadCorruptFile)
                }
                drafts[draft.id] = draft
            } catch {
                quarantine(url, reason: error)
            }
        }
        return drafts
    }

    /// One unreadable file must not lock the account out of every draft: set it
    /// aside where it can still be inspected and keep loading the rest.
    private func quarantine(_ url: URL, reason: Error) {
        let corrupt = url.deletingLastPathComponent().appendingPathComponent("corrupt", isDirectory: true)
        let destination = corrupt.appendingPathComponent(
            "\(Int(Date().timeIntervalSince1970 * 1000))-" + url.lastPathComponent)
        do {
            try FileManager.default.createDirectory(at: corrupt,
                withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try FileManager.default.moveItem(at: url, to: destination)
            Self.log.error("Quarantined unreadable draft \(url.lastPathComponent, privacy: .public): \(reason.localizedDescription, privacy: .public)")
        } catch {
            Self.log.error("Skipped unreadable draft \(url.lastPathComponent, privacy: .public); quarantine failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func remove(_ id: String, owner: String) throws {
        let url = try file(id, owner: owner)
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }
}
