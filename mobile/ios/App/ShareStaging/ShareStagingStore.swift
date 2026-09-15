import Foundation

/**
 * App Group durable staging for iOS Share → containing app upload.
 * Layout mirrors Android ShareStagingStore:
 *   <group>/intake-staging/<clientBatchId>/{meta.json, 000.jpg, …}
 *   <group>/intake-staging/pending.json
 */
enum ShareStagingStore {
  static let appGroupId = "group.co.rematcher.exchange"

  static var containerURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
  }

  static var stagingRoot: URL? {
    guard let container = containerURL else { return nil }
    let root = container.appendingPathComponent("intake-staging", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
  }

  static func batchDirectory(clientBatchId: String) -> URL? {
    guard let root = stagingRoot else { return nil }
    return root.appendingPathComponent(clientBatchId, isDirectory: true)
  }

  static func loadPending() -> [String: String]? {
    guard let root = stagingRoot else { return nil }
    let url = root.appendingPathComponent("pending.json")
    guard let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String]
    else { return nil }
    return obj
  }

  static func clearPending() {
    guard let root = stagingRoot else { return }
    try? FileManager.default.removeItem(at: root.appendingPathComponent("pending.json"))
  }

  static func loadMeta(clientBatchId: String) -> [String: Any]? {
    guard let dir = batchDirectory(clientBatchId: clientBatchId) else { return nil }
    let url = dir.appendingPathComponent("meta.json")
    guard let data = try? Data(contentsOf: url),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return obj
  }

  static func listImageFiles(clientBatchId: String) -> [URL] {
    guard let dir = batchDirectory(clientBatchId: clientBatchId),
          let files = try? FileManager.default.contentsOfDirectory(
            at: dir,
            includingPropertiesForKeys: [.fileSizeKey],
            options: [.skipsHiddenFiles]
          )
    else { return [] }
    let allowed: Set<String> = ["jpg", "jpeg", "png", "webp", "heic", "heif"]
    return files
      .filter { allowed.contains($0.pathExtension.lowercased()) }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  static func deleteBatch(clientBatchId: String) {
    if let dir = batchDirectory(clientBatchId: clientBatchId) {
      try? FileManager.default.removeItem(at: dir)
    }
    if let pending = loadPending(), pending["clientBatchId"] == clientBatchId {
      clearPending()
    }
  }
}
