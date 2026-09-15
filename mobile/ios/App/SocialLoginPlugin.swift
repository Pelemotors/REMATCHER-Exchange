import Capacitor
import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/**
 * Sign in with Apple. Requires Xcode capability + APPLE_CLIENT_ID on server (OWNER).
 */
@objc(SocialLoginPlugin)
public class SocialLoginPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  public let identifier = "SocialLoginPlugin"
  public let jsName = "SocialLogin"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
  ]

  private var pendingCall: CAPPluginCall?
  private var currentNonce: String?

  @objc func signIn(_ call: CAPPluginCall) {
    let provider = call.getString("provider") ?? "apple"
    guard provider == "apple" else {
      call.reject("unsupported_provider")
      return
    }
    pendingCall = call
    let nonce = randomNonce()
    currentNonce = nonce
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(nonce)
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    if let window = self.bridge?.viewController?.view.window {
      return window
    }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let key = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) {
      return key
    }
    return UIWindow(frame: UIScreen.main.bounds)
  }

  public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    guard let call = pendingCall else { return }
    pendingCall = nil
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
          let tokenData = credential.identityToken,
          let idToken = String(data: tokenData, encoding: .utf8) else {
      call.reject("apple_missing_identity_token")
      return
    }
    var name: String?
    if let full = credential.fullName {
      let parts = [full.givenName, full.familyName].compactMap { $0 }
      if !parts.isEmpty { name = parts.joined(separator: " ") }
    }
    call.resolve([
      "ok": true,
      "idToken": idToken,
      "nonce": currentNonce ?? "",
      "name": name as Any,
    ])
  }

  public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    guard let call = pendingCall else { return }
    pendingCall = nil
    let ns = error as NSError
    if ns.code == ASAuthorizationError.canceled.rawValue {
      call.reject("cancelled")
    } else {
      call.reject("apple_sign_in_failed", error.localizedDescription, error)
    }
  }

  private func randomNonce(length: Int = 32) -> String {
    let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
    var result = ""
    var remaining = length
    while remaining > 0 {
      var randoms = [UInt8](repeating: 0, count: 16)
      _ = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
      for r in randoms where remaining > 0 {
        if r < charset.count {
          result.append(charset[Int(r)])
          remaining -= 1
        }
      }
    }
    return result
  }

  private func sha256(_ input: String) -> String {
    let data = Data(input.utf8)
    let hash = SHA256.hash(data: data)
    return hash.map { String(format: "%02x", $0) }.joined()
  }
}
