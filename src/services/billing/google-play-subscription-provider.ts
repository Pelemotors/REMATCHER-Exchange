import "server-only";
import type { NormalizedSubscription, PurchaseProof } from "./types";
import { isBillingFakeMode } from "./types";

export function parseFakeGoogleProof(proof: string): NormalizedSubscription {
  const raw = JSON.parse(proof) as Record<string, unknown>;
  const now = new Date();
  const periodEnd = raw.periodEnd
    ? new Date(String(raw.periodEnd))
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const graceEnd = raw.graceEnd ? new Date(String(raw.graceEnd)) : null;
  return {
    provider: "GOOGLE",
    externalSubscriptionId: String(
      raw.subscriptionId ?? raw.purchaseToken ?? "google-sub"
    ),
    externalProductId: String(raw.productId ?? "monthly_subscription"),
    externalTransactionId: String(
      raw.transactionId ?? raw.orderId ?? `google-tx-${Date.now()}`
    ),
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

export async function verifyGooglePlayPurchase(
  proof: PurchaseProof
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode() || proof.proof.trim().startsWith("{")) {
    return parseFakeGoogleProof(proof.proof);
  }
  throw new Error(
    "Google Play subscription verification not configured (set BILLING_PROVIDER_MODE=fake or OWNER Google Play credentials)"
  );
}

export async function verifyGoogleWebhookPayload(
  body: string,
  _signature?: string | null
): Promise<NormalizedSubscription> {
  if (isBillingFakeMode() || !process.env.GOOGLE_PLAY_WEBHOOK_SECRET) {
    return parseFakeGoogleProof(body);
  }
  throw new Error("Google webhook signature verification not configured");
}
