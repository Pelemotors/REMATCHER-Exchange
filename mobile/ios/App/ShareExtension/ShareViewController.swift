import UIKit
import UniformTypeIdentifiers

/**
 * iOS Share Extension — Photos / WhatsApp → App Group staging → open containing app.
 * No OCR / GOV / AI here. Durable local persist only.
 */
class ShareViewController: UIViewController {
  private let appGroupId = "group.co.rematcher.exchange"
  private let urlScheme = "rematcher-exchange"
  private let indexLock = NSLock()
  private var fileIndex = 0
  private var textBits: [String] = []
  private var fileNames: [String] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor { traits in
      traits.userInterfaceStyle == .dark
        ? UIColor(white: 0.08, alpha: 1)
        : UIColor(white: 0.96, alpha: 1)
    }
    let label = UILabel()
    label.text = "שולח ל־REMATCHER Exchange…"
    label.textAlignment = .center
    label.numberOfLines = 0
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.persistAndHandoff()
    }
  }

  private func persistAndHandoff() {
    let batchId = UUID().uuidString
    guard let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupId
    ) else {
      finish(cancelled: true)
      return
    }

    let stagingRoot = container.appendingPathComponent("intake-staging", isDirectory: true)
    let dir = stagingRoot.appendingPathComponent(batchId, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    } catch {
      finish(cancelled: true)
      return
    }

    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    let group = DispatchGroup()
    let imageTypes = [
      UTType.image.identifier,
      UTType.jpeg.identifier,
      UTType.png.identifier,
      UTType.webP.identifier,
      UTType.heic.identifier,
      "public.heif",
    ]

    for item in items {
      if let text = item.attributedContentText?.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        indexLock.lock()
        textBits.append(text)
        indexLock.unlock()
      }
      for provider in item.attachments ?? [] {
        let matchedImage = imageTypes.first { provider.hasItemConformingToTypeIdentifier($0) }
        if let typeId = matchedImage {
          group.enter()
          provider.loadItem(forTypeIdentifier: typeId, options: nil) { [weak self] data, _ in
            defer { group.leave() }
            self?.stageImagePayload(data, into: dir)
          }
          continue
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          group.enter()
          provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] data, _ in
            defer { group.leave() }
            if let s = data as? String, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              self?.indexLock.lock()
              self?.textBits.append(s)
              self?.indexLock.unlock()
            } else if let d = data as? Data, let s = String(data: d, encoding: .utf8),
                      !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
              self?.indexLock.lock()
              self?.textBits.append(s)
              self?.indexLock.unlock()
            }
          }
        }
      }
    }

    group.notify(queue: .global(qos: .userInitiated)) { [weak self] in
      guard let self else { return }
      let text = self.textBits.joined(separator: "\n")
      let files = self.fileNames
      if files.isEmpty && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        self.finish(cancelled: true)
        return
      }

      let meta: [String: Any] = [
        "clientBatchId": batchId,
        "text": text,
        "source": "IOS_SHARE",
        "files": files.map { ["name": $0] as [String: String] },
      ]
      let metaUrl = dir.appendingPathComponent("meta.json")
      if let encoded = try? JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted]) {
        try? encoded.write(to: metaUrl, options: .atomic)
      }

      let pending: [String: String] = [
        "clientBatchId": batchId,
        "source": "IOS_SHARE",
      ]
      let pendingUrl = stagingRoot.appendingPathComponent("pending.json")
      if let encoded = try? JSONSerialization.data(withJSONObject: pending) {
        try? encoded.write(to: pendingUrl, options: .atomic)
      }

      var components = URLComponents()
      components.scheme = self.urlScheme
      components.host = "intake"
      components.queryItems = [
        URLQueryItem(name: "clientBatchId", value: batchId),
        URLQueryItem(name: "source", value: "IOS_SHARE"),
        URLQueryItem(name: "staged", value: "1"),
      ]
      if !text.isEmpty {
        let clipped = text.count > 1500 ? String(text.prefix(1500)) : text
        components.queryItems?.append(URLQueryItem(name: "text", value: clipped))
      }

      DispatchQueue.main.async {
        if let url = components.url {
          self.openContainingApp(url: url)
        }
        // Give the open a beat, then dismiss the sheet.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
          self.finish(cancelled: false)
        }
      }
    }
  }

  private func stageImagePayload(_ data: Any?, into dir: URL) {
    var bytes: Data?
    var ext = "jpg"
    if let url = data as? URL {
      bytes = try? Data(contentsOf: url)
      let pathExt = url.pathExtension.lowercased()
      if ["png", "webp", "heic", "jpeg", "jpg"].contains(pathExt) {
        ext = pathExt == "jpeg" ? "jpg" : pathExt
      }
    } else if let image = data as? UIImage {
      bytes = image.jpegData(compressionQuality: 0.92)
      ext = "jpg"
    } else if let d = data as? Data {
      bytes = d
    }
    guard let bytes, !bytes.isEmpty else { return }

    indexLock.lock()
    let i = fileIndex
    fileIndex += 1
    let name = String(format: "%03d.%@", i, ext)
    fileNames.append(name)
    indexLock.unlock()

    let dest = dir.appendingPathComponent(name)
    try? bytes.write(to: dest, options: .atomic)
  }

  /// Share Extensions cannot call UIApplication.shared.open; walk responder / extensionContext.
  private func openContainingApp(url: URL) {
    var responder: UIResponder? = self
    let selector = sel_registerName("openURL:")
    while let r = responder {
      if r.responds(to: selector) {
        _ = r.perform(selector, with: url)
        return
      }
      responder = r.next
    }
    extensionContext?.open(url, completionHandler: nil)
  }

  private func finish(cancelled: Bool) {
    DispatchQueue.main.async {
      if cancelled {
        self.extensionContext?.cancelRequest(
          withError: NSError(domain: "co.rematcher.exchange.ShareExtension", code: 1)
        )
      } else {
        self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
      }
    }
  }
}
