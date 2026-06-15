import Foundation

/// App configuration. Point `baseURL` at your running Keep deployment
/// (e.g. https://keeptxt.com) or http://localhost:3000 for local dev.
enum Config {
    static let baseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "KEEP_BASE_URL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }()
}
