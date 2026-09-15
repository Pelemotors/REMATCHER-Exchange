import UIKit

/**
 * Containing-app intake handoff for iOS Share Extension.
 * Reads App Group staging written by ShareViewController, then the Capacitor
 * WebView opens /intake/handoff with clientBatchId — upload uses web session.
 *
 * Requires App Group `group.co.rematcher.exchange` + URL scheme `rematcher-exchange`.
 * Signing / TestFlight are external Owner actions (see docs/IOS_TESTFLIGHT_OWNER_ACTIONS.md).
 */
enum IntakeShareHandoff {
  static let appGroupId = "group.co.rematcher.exchange"
  static let urlScheme = "rematcher-exchange"

  static func stagingDirectory(clientBatchId: String) -> URL? {
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupId
    ) else { return nil }
    return container.appendingPathComponent("intake-staging/\(clientBatchId)", isDirectory: true)
  }

  static func readMeta(clientBatchId: String) -> [String: String]? {
    guard let dir = stagingDirectory(clientBatchId: clientBatchId) else { return nil }
    let metaUrl = dir.appendingPathComponent("meta.json")
    guard let data = try? Data(contentsOf: metaUrl),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String]
    else { return nil }
    return obj
  }

  static func stagedImageURLs(clientBatchId: String) -> [URL] {
    guard let dir = stagingDirectory(clientBatchId: clientBatchId),
          let files = try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: nil
          )
    else { return [] }
    return files
      .filter { ["jpg", "jpeg", "png", "webp", "heic"].contains($0.pathExtension.lowercased()) }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  /// Deep link into Field Test / Production web handoff after native staging.
  static func handoffURL(clientBatchId: String, source: String = "IOS_SHARE") -> URL? {
    var components = URLComponents()
    components.scheme = urlScheme
    components.host = "intake"
    components.queryItems = [
      URLQueryItem(name: "clientBatchId", value: clientBatchId),
      URLQueryItem(name: "source", value: source),
      URLQueryItem(name: "staged", value: "1"),
    ]
    return components.url
  }

  static func clearStaging(clientBatchId: String) {
    guard let dir = stagingDirectory(clientBatchId: clientBatchId) else { return }
    try? FileManager.default.removeItem(at: dir)
  }
}
