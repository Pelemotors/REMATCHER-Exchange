import Foundation
import Capacitor
import WebKit

/**
 * Capacitor bridge: App Group staging → authenticated Intake API → ACK.
 * Cookie authority comes from the Capacitor WKWebView session (never client dealerId).
 *
 * Register in the Capacitor iOS app:
 *   bridge.registerPluginInstance(ShareStagingPlugin())
 * or via CAPBridgedPlugin auto-discovery once the file is in the App target.
 */
@objc(ShareStagingPlugin)
public class ShareStagingPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "ShareStagingPlugin"
  public let jsName = "ShareStaging"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getPending", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "consumeAndUpload", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clearBatch", returnType: CAPPluginReturnPromise),
  ]

  /// Override via Info.plist `RematcherIntakeBaseURL` or Capacitor server.url at wiring time.
  private var baseURL: String {
    if let fromPlist = Bundle.main.object(forInfoDictionaryKey: "RematcherIntakeBaseURL") as? String,
       !fromPlist.isEmpty {
      return fromPlist.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
    return "https://field-test-exchange.rematcher.co.il"
  }

  @objc func getPending(_ call: CAPPluginCall) {
    guard let pending = ShareStagingStore.loadPending(),
          let batchId = pending["clientBatchId"], !batchId.isEmpty
    else {
      call.resolve(["pending": false])
      return
    }
    let meta = ShareStagingStore.loadMeta(clientBatchId: batchId)
    let text = (meta?["text"] as? String) ?? ""
    let files = ShareStagingStore.listImageFiles(clientBatchId: batchId)
    call.resolve([
      "pending": true,
      "clientBatchId": batchId,
      "source": pending["source"] ?? "IOS_SHARE",
      "text": text,
      "fileCount": files.count,
    ])
  }

  @objc func clearBatch(_ call: CAPPluginCall) {
    if let batchId = call.getString("clientBatchId"), !batchId.isEmpty {
      ShareStagingStore.deleteBatch(clientBatchId: batchId)
    }
    call.resolve()
  }

  @objc func consumeAndUpload(_ call: CAPPluginCall) {
    var batchId = call.getString("clientBatchId") ?? ""
    if batchId.isEmpty {
      batchId = ShareStagingStore.loadPending()?["clientBatchId"] ?? ""
    }
    guard !batchId.isEmpty else {
      call.reject("no_pending_batch")
      return
    }

    let clientBatchId = batchId
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      do {
        let result = try self.uploadBatch(clientBatchId: clientBatchId)
        call.resolve(result)
      } catch {
        let msg = error.localizedDescription
        if msg.hasPrefix("unauthorized:") {
          call.resolve(["ok": false, "needsLogin": true, "error": msg])
          return
        }
        call.reject(msg)
      }
    }
  }

  private func uploadBatch(clientBatchId: String) throws -> [String: Any] {
    let cookie = cookieHeader()
    if cookie.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return ["ok": false, "needsLogin": true]
    }

    guard let meta = ShareStagingStore.loadMeta(clientBatchId: clientBatchId) else {
      return ["ok": false, "error": "meta_missing"]
    }

    // 1) create/resume
    let createBody: [String: Any] = [
      "action": "create",
      "clientBatchId": clientBatchId,
      "source": "IOS_SHARE",
    ]
    let createResp = try httpJSON(
      method: "POST",
      path: "/api/intake/batch",
      json: createBody,
      cookie: cookie
    )
    guard let batch = createResp["batch"] as? [String: Any],
          let serverBatchId = batch["id"] as? String
    else {
      return ["ok": false, "needsLogin": true, "error": "create_failed"]
    }

    // 2) text
    if let text = meta["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      _ = try httpJSON(
        method: "POST",
        path: "/api/intake/batch",
        json: ["action": "add_text", "batchId": serverBatchId, "text": text],
        cookie: cookie
      )
    }

    // 3) media
    let files = ShareStagingStore.listImageFiles(clientBatchId: clientBatchId)
    var order = 0
    for file in files {
      try httpMultipart(
        path: "/api/intake/batch",
        cookie: cookie,
        batchId: serverBatchId,
        fileURL: file,
        order: order
      )
      order += 1
    }

    // 4) ack
    let ackResp = try httpJSON(
      method: "POST",
      path: "/api/intake/batch",
      json: ["action": "ack", "batchId": serverBatchId],
      cookie: cookie
    )
    guard (ackResp["ok"] as? Bool) == true else {
      return ["ok": false, "error": "ack_failed"]
    }

    ShareStagingStore.deleteBatch(clientBatchId: clientBatchId)
    return [
      "ok": true,
      "batchId": serverBatchId,
      "acknowledgedAt": ackResp["acknowledgedAt"] as? String ?? "",
      "needsLogin": false,
    ]
  }

  private func cookieHeader() -> String {
    // Prefer live WKWebView cookies for the intake host.
    let host = URL(string: baseURL)?.host ?? "field-test-exchange.rematcher.co.il"
    var result = ""
    let sem = DispatchSemaphore(value: 0)
    DispatchQueue.main.async {
      guard let webView = self.bridge?.webView else {
        sem.signal()
        return
      }
      webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
        let matched = cookies.filter { cookie in
          host.hasSuffix(cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")))
            || cookie.domain.hasSuffix(host)
        }
        result = matched.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
        sem.signal()
      }
    }
    _ = sem.wait(timeout: .now() + 5)
    if !result.isEmpty { return result }

    // Fallback: shared HTTPCookieStorage
    if let url = URL(string: baseURL),
       let cookies = HTTPCookieStorage.shared.cookies(for: url), !cookies.isEmpty {
      return HTTPCookie.requestHeaderFields(with: cookies)["Cookie"] ?? ""
    }
    return ""
  }

  private func httpJSON(
    method: String,
    path: String,
    json: [String: Any],
    cookie: String
  ) throws -> [String: Any] {
    guard let url = URL(string: baseURL + path) else { throw URLError(.badURL) }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    req.setValue(cookie, forHTTPHeaderField: "Cookie")
    req.httpBody = try JSONSerialization.data(withJSONObject: json)
    req.timeoutInterval = 60

    let sem = DispatchSemaphore(value: 0)
    var dataOut: Data?
    var responseOut: URLResponse?
    var errorOut: Error?
    URLSession.shared.dataTask(with: req) { data, response, error in
      dataOut = data
      responseOut = response
      errorOut = error
      sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 90)
    if let errorOut { throw errorOut }
    if let http = responseOut as? HTTPURLResponse, http.statusCode == 401 || http.statusCode == 403 {
      throw NSError(domain: "ShareStaging", code: http.statusCode, userInfo: [
        NSLocalizedDescriptionKey: "unauthorized:\(http.statusCode)",
      ])
    }
    guard let dataOut,
          let obj = try JSONSerialization.jsonObject(with: dataOut) as? [String: Any]
    else {
      throw NSError(domain: "ShareStaging", code: 2, userInfo: [
        NSLocalizedDescriptionKey: "invalid_json",
      ])
    }
    return obj
  }

  private func httpMultipart(
    path: String,
    cookie: String,
    batchId: String,
    fileURL: URL,
    order: Int
  ) throws {
    guard let url = URL(string: baseURL + path) else { throw URLError(.badURL) }
    let boundary = "----RematcherBoundary\(UUID().uuidString)"
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue(cookie, forHTTPHeaderField: "Cookie")
    req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    req.timeoutInterval = 120

    let mime: String = {
      switch fileURL.pathExtension.lowercased() {
      case "png": return "image/png"
      case "webp": return "image/webp"
      case "heic", "heif": return "image/heic"
      default: return "image/jpeg"
      }
    }()

    var body = Data()
    func append(_ s: String) { body.append(Data(s.utf8)) }
    append("--\(boundary)\r\n")
    append("Content-Disposition: form-data; name=\"batchId\"\r\n\r\n\(batchId)\r\n")
    append("--\(boundary)\r\n")
    append("Content-Disposition: form-data; name=\"originalOrder\"\r\n\r\n\(order)\r\n")
    append("--\(boundary)\r\n")
    append(
      "Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n"
    )
    append("Content-Type: \(mime)\r\n\r\n")
    body.append(try Data(contentsOf: fileURL))
    append("\r\n--\(boundary)--\r\n")
    req.httpBody = body

    let sem = DispatchSemaphore(value: 0)
    var status = 0
    var err: Error?
    URLSession.shared.dataTask(with: req) { _, response, error in
      status = (response as? HTTPURLResponse)?.statusCode ?? 0
      err = error
      sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 120)
    if let err { throw err }
    if status >= 400 {
      throw NSError(domain: "ShareStaging", code: status, userInfo: [
        NSLocalizedDescriptionKey: "upload_http_\(status)",
      ])
    }
  }
}
