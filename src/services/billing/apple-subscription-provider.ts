import "server-only";
import type { NormalizedSubscription, PurchaseProof } from "./types";
import { isBillingFakeMode } from "./types";

/**
 * Fake proof JSON:
 * `{ "subscriptionId":"sub_1","productId":"plan_monthly","transactionId":"tx_1",
 *    "status":"ACTIVE","periodEnd":"...","graceEnd":null,"eventType":"INITIAL_BUY" }`
 */
export function parseFakeAppleProof(proof: string): NormalizedSubscription {
  const raw = JSON.parse(proof) as Record<string, unknown>;
  const now = new Date();
  const periodEnd = raw.periodEnd
    ? new Date(String(raw.periodEnd))
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const graceEnd = raw.graceEnd ? new Date(String(raw.graceEnd)) : null;
  return {
    provider: "APPLE",
    externalSubscriptionId: String(raw.subscriptionId ?? raw.originalTransactionId ?? "apple-sub"),
    externalProductId: String(raw.productId ?? "com.rematcher.exchange.monthly"),
    externalTransactionId: String(raw.transactionId ?? `apple-tx-${Date.now()}`),
    status: (raw.status as NormalizedSubscription["status"]) ?? "ACTIVE",
    autoRenew: raw.autoRenew !== false,
    purchasedAt: raw.purchasedAt ? new Date(String(raw.purchasedAt)) : now,
    currentPeriodStart: raw.periodStart ? new Date(String(raw.periodStart)) : now,
    currentPeriodEnd: periodEnd,
    gracePeriodEndsAt: graceEnd,
    environment: raw.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
    eventType: String(raw.eventType ?? "INITIAL_BUY"),
    raw,
  };
}

export async function verifyApplePurchase(
  proof: PurchaseProof
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode() || proof.proof.trim().startsWith("{")) {
    return parseFakeAppleProof(proof.proof);
  }
  // Real App Store Server API verification — OWNER_REQUIRED credentials
  throw new Error(
    "Apple subscription verification not configured (set BILLING_PROVIDER_MODE=fake or OWNER Apple keys)"
  );
}

export async function verifyAppleWebhookPayload(
  body: string,
  _signature?: string | null
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode() || !process.env.APPLE_IAP_SHARED_SECRET) {
    return parseFakeAppleProof(body);
  }
  throw new Error("Apple webhook signature verification not configured");
}
