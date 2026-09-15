import Capacitor
import Foundation
import StoreKit
import AuthenticationServices

/**
 * StoreKit 2 bridge. Compiles for App target; live products require App Store Connect IDs (OWNER).
 */
@objc(StoreBillingPlugin)
public class StoreBillingPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "StoreBillingPlugin"
  public let jsName = "StoreBilling"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "queryProducts", returnType: CAPPluginReturnPromise),
  ]

  @objc func purchase(_ call: CAPPluginCall) {
    guard let productId = call.getString("productId"), !productId.isEmpty else {
      call.resolve(["ok": false, "reason": "missing_product_id"])
      return
    }
    if #available(iOS 15.0, *) {
      Task {
        do {
          let products = try await Product.products(for: [productId])
          guard let product = products.first else {
            call.resolve(["ok": false, "reason": "product_not_found", "productId": productId])
            return
          }
          let result = try await product.purchase()
          switch result {
          case .success(let verification):
            let transaction = try checkVerified(verification)
            let jws = verification.jwsRepresentation
            await transaction.finish()
            call.resolve([
              "ok": true,
              "provider": "APPLE",
              "productId": productId,
              "proof": jws,
              "transactionId": String(transaction.id),
            ])
          case .userCancelled:
            call.resolve(["ok": false, "reason": "cancelled"])
          case .pending:
            call.resolve(["ok": false, "reason": "pending"])
          @unknown default:
            call.resolve(["ok": false, "reason": "unknown"])
          }
        } catch {
          call.resolve(["ok": false, "reason": "storekit_error", "message": error.localizedDescription])
        }
      }
    } else {
      call.resolve(["ok": false, "reason": "storekit_requires_ios_15"])
    }
  }

  @objc func restore(_ call: CAPPluginCall) {
    if #available(iOS 15.0, *) {
      Task {
        var proofs: [[String: String]] = []
        for await result in Transaction.currentEntitlements {
          if case .verified(let transaction) = result {
            proofs.append([
              "provider": "APPLE",
              "productId": transaction.productID,
              "proof": String(transaction.id),
              "transactionId": String(transaction.id),
            ])
          }
        }
        call.resolve(["ok": true, "proofs": proofs])
      }
    } else {
      call.resolve(["ok": true, "proofs": []])
    }
  }

  @objc func queryProducts(_ call: CAPPluginCall) {
    let ids = call.getArray("productIds", String.self) ?? []
    if ids.isEmpty {
      call.resolve(["ok": false, "reason": "missing_product_ids", "products": []])
      return
    }
    if #available(iOS 15.0, *) {
      Task {
        do {
          let products = try await Product.products(for: Set(ids))
          let mapped = products.map { p -> [String: Any] in
            [
              "productId": p.id,
              "displayName": p.displayName,
              "description": p.description,
              "price": p.displayPrice,
              "currencyCode": p.priceFormatStyle.locale.currency?.identifier ?? "",
            ]
          }
          call.resolve(["ok": true, "products": mapped])
        } catch {
          call.resolve(["ok": false, "reason": "storekit_error", "products": [], "message": error.localizedDescription])
        }
      }
    } else {
      call.resolve(["ok": false, "reason": "storekit_requires_ios_15", "products": []])
    }
  }

  @available(iOS 15.0, *)
  private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
    switch result {
    case .unverified(_, let error):
      throw error
    case .verified(let safe):
      return safe
    }
  }
}
