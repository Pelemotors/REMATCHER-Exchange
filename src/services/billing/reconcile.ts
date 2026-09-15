import "server-only";
import { recalculateEntitlement } from "@/services/entitlements";
import type { NormalizedSubscription } from "./types";
import {
  persistProviderTransaction,
  upsertDealerSubscription,
} from "./ledger";
import { logAppEvent } from "@/services/events/log-event";

export async function applyNormalizedSubscription(params: {
  dealerId: string;
  purchaserUserId?: string | null;
  normalized: NormalizedSubscription;
}) {
  const { subscription } = await upsertDealerSubscription(params);
  const tx = await persistProviderTransaction({
    dealerId: params.dealerId,
    subscriptionId: subscription.id,
    normalized: params.normalized,
  });

  const entitlement = await recalculateEntitlement(params.dealerId);

  if (!tx.created) {
    await logAppEvent({
      eventType: "BILLING_WEBHOOK_DUPLICATE",
      entityType: "ProviderTransaction",
      entityId: tx.transactionId,
      dealerId: params.dealerId,
      metadata: {
        provider: params.normalized.provider,
        externalTransactionId: params.normalized.externalTransactionId,
        eventType: params.normalized.eventType,
      },
    });
  }

  return { subscription, transaction: tx, entitlement };
}

export async function restorePurchases(params: {
  dealerId: string;
  purchaserUserId?: string | null;
  normalizedList: NormalizedSubscription[];
}) {
  const results = [];
  for (const normalized of params.normalizedList) {
    results.push(
      await applyNormalizedSubscription({
        dealerId: params.dealerId,
        purchaserUserId: params.purchaserUserId,
        normalized,
      })
    );
  }
  const entitlement = await recalculateEntitlement(params.dealerId);
  await logAppEvent({
    eventType: "PURCHASE_RESTORED",
    entityType: "Dealer",
    entityId: params.dealerId,
    dealerId: params.dealerId,
    userId: params.purchaserUserId ?? undefined,
    metadata: { count: params.normalizedList.length },
  });
  return { results, entitlement };
}
