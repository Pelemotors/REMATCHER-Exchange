import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

/**
 * Real iOS Share Extension entry.
 * Writes attachments into App Group container, then opens containing app via URL scheme.
 * Heavy OCR/GOV/AI must NOT run here — only durable handoff.
 */
class ShareViewController: UIViewController {
  private let appGroupId = "group.co.rematcher.exchange"
  private let urlScheme = "rematcher-exchange"

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.persistAndHandoff()
    }
  }

  private func persistAndHandoff() {
    let batchId = UUID().uuidString
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      self.finish()
      return
    }
    let dir = container.appendingPathComponent("intake-staging/\(batchId)", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    var textBits: [String] = []
    var index = 0

    let group = DispatchGroup()
    for item in items {
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { data, _ in
            defer { group.leave() }
            if let url = data as? URL, let bytes = try? Data(contentsOf: url) {
              let dest = dir.appendingPathComponent(String(format: "%03d.jpg", index))
              try? bytes.write(to: dest)
              index += 1
            } else if let image = data as? UIImage, let bytes = image.jpegData(compressionQuality: 0.9) {
              let dest = dir.appendingPathComponent(String(format: "%03d.jpg", index))
              try? bytes.write(to: dest)
              index += 1
            }
          }
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
            defer { group.leave() }
            if let s = data as? String { textBits.append(s) }
          }
        }
      }
    }

    group.notify(queue: .main) {
      let meta = ["clientBatchId": batchId, "text": textBits.joined(separator: "\n"), "source": "IOS_SHARE"] as [String : String]
      let metaUrl = dir.appendingPathComponent("meta.json")
      if let encoded = try? JSONSerialization.data(withJSONObject: meta) {
        try? encoded.write(to: metaUrl)
      }
      if let url = URL(string: "\(self.urlScheme)://intake?clientBatchId=\(batchId)&source=IOS_SHARE") {
        var responder: UIResponder? = self
        while let r = responder {
          if let app = r as? UIApplication {
            app.open(url, options: [:], completionHandler: nil)
            break
          }
          responder = r.next
        }
        // Fallback open via extension context
        self.extensionContext?.open(url, completionHandler: nil)
      }
      self.finish()
    }
  }

  private func finish() {
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }
}
