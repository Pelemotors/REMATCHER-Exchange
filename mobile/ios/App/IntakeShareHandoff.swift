import Foundation
import UIKit

/**
 * Containing-app intake handoff for iOS Share Extension.
 *
 * 1. Share Extension writes App Group staging + pending.json
 * 2. Opens rematcher-exchange://intake?clientBatchId=…&source=IOS_SHARE&staged=1
 * 3. AppDelegate calls `IntakeShareHandoff.handleOpenURL` → loads web /intake/handoff
 * 4. Web calls Capacitor ShareStaging.consumeAndUpload → Intake Engine ACK
 *
 * Requires App Group `group.co.rematcher.exchange` + URL scheme `rematcher-exchange`.
 */
enum IntakeShareHandoff {
  static let appGroupId = ShareStagingStore.appGroupId
  static let urlScheme = "rematcher-exchange"

  static var intakeBaseURL: String {
    if let fromPlist = Bundle.main.object(forInfoDictionaryKey: "RematcherIntakeBaseURL") as? String,
       !fromPlist.isEmpty {
      return fromPlist.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
    return "https://field-test-exchange.rematcher.co.il"
  }

  static func stagingDirectory(clientBatchId: String) -> URL? {
    ShareStagingStore.batchDirectory(clientBatchId: clientBatchId)
  }

  static func readMeta(clientBatchId: String) -> [String: String]? {
    guard let meta = ShareStagingStore.loadMeta(clientBatchId: clientBatchId) else { return nil }
    var out: [String: String] = [:]
    for (k, v) in meta {
      if let s = v as? String { out[k] = s }
    }
    return out
  }

  static func stagedImageURLs(clientBatchId: String) -> [URL] {
    ShareStagingStore.listImageFiles(clientBatchId: clientBatchId)
  }

  static func handoffURL(clientBatchId: String, source: String = "IOS_SHARE", text: String? = nil) -> URL? {
    var components = URLComponents()
    components.scheme = urlScheme
    components.host = "intake"
    var items = [
      URLQueryItem(name: "clientBatchId", value: clientBatchId),
      URLQueryItem(name: "source", value: source),
      URLQueryItem(name: "staged", value: "1"),
    ]
    if let text, !text.isEmpty {
      let clipped = text.count > 1500 ? String(text.prefix(1500)) : text
      items.append(URLQueryItem(name: "text", value: clipped))
    }
    components.queryItems = items
    return components.url
  }

  /// Web handoff URL loaded inside Capacitor WKWebView.
  static func webHandoffURL(from openURL: URL) -> URL? {
    guard let comps = URLComponents(url: openURL, resolvingAgainstBaseURL: false) else { return nil }
    let host = comps.host ?? ""
    let isIntake = host == "intake" || comps.path.contains("intake")
    guard openURL.scheme == urlScheme, isIntake else { return nil }

    var web = URLComponents(string: intakeBaseURL + "/intake/handoff")
    web?.queryItems = comps.queryItems
    if web?.queryItems?.contains(where: { $0.name == "staged" }) != true {
      var items = web?.queryItems ?? []
      items.append(URLQueryItem(name: "staged", value: "1"))
      if items.contains(where: { $0.name == "source" }) != true {
        items.append(URLQueryItem(name: "source", value: "IOS_SHARE"))
      }
      web?.queryItems = items
    }
    return web?.url
  }

  static func clearStaging(clientBatchId: String) {
    ShareStagingStore.deleteBatch(clientBatchId: clientBatchId)
  }
}

/**
 * Drop into Capacitor `AppDelegate` (or SceneDelegate):
 *
 * ```
 * func application(_ app: UIApplication, open url: URL, options: …) -> Bool {
 *   if IntakeShareAppBridge.handle(url: url, bridge: bridge) { return true }
 *   return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
 * }
 * ```
 */
enum IntakeShareAppBridge {
  /// Returns true when the URL was an intake deep link and navigation was requested.
  @discardableResult
  static func handle(url: URL, loadInWebView: (URL) -> Void) -> Bool {
    guard let webURL = IntakeShareHandoff.webHandoffURL(from: url) else { return false }
    loadInWebView(webURL)
    return true
  }
}
