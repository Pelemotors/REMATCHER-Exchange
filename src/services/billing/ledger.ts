import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NormalizedSubscription } from "./types";
import { logAppEvent } from "@/services/events/log-event";

export async function persistProviderTransaction(params: {
  dealerId: string;
  subscriptionId?: string | null;
  normalized: NormalizedSubscription;
}): Promise<{ created: boolean; transactionId: string }> {
  const { dealerId, subscriptionId, normalized } = params;
  try {
    const row = await prisma.providerTransaction.create({
      data: {
        dealerId,
        subscriptionId: subscriptionId ?? null,
        provider: normalized.provider,
        externalTransactionId: normalized.externalTransactionId,
        externalProductId: normalized.externalProductId,
        eventType: normalized.eventType,
        status: normalized.status,
        environment: normalized.environment,
        occurredAt: normalized.purchasedAt ?? new Date(),
        rawPayloadJson: normalized.raw as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    });
    return { created: true, transactionId: row.id };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.providerTransaction.findFirst({
        where: {
          provider: normalized.provider,
          externalTransactionId: normalized.externalTransactionId,
          eventType: normalized.eventType,
        },
      });
      return {
        created: false,
        transactionId: existing?.id ?? "duplicate",
      };
    }
    throw err;
  }
}

export async function upsertDealerSubscription(params: {
  dealerId: string;
  purchaserUserId?: string | null;
  normalized: NormalizedSubscription;
}) {
  const { dealerId, purchaserUserId, normalized } = params;

  const product = await prisma.providerProduct.findFirst({
    where: {
      provider: normalized.provider,
      externalProductId: normalized.externalProductId,
      active: true,
    },
    include: { plan: true },
  });

  const existing = await prisma.dealerSubscription.findUnique({
    where: {
      provider_externalSubscriptionId: {
        provider: normalized.provider,
        externalSubscriptionId: normalized.externalSubscriptionId,
      },
    },
  });

  const data = {
    dealerId,
    planId: product?.planId ?? null,
    provider: normalized.provider,
    externalSubscriptionId: normalized.externalSubscriptionId,
    externalProductId: normalized.externalProductId,
    status: normalized.status,
    autoRenew: normalized.autoRenew,
    purchasedAt: normalized.purchasedAt,
    currentPeriodStart: normalized.currentPeriodStart,
    currentPeriodEnd: normalized.currentPeriodEnd,
    gracePeriodEndsAt: normalized.gracePeriodEndsAt,
    environment: normalized.environment,
    purchaserUserId: purchaserUserId ?? null,
    rawSnapshotJson: normalized.raw as Prisma.InputJsonValue,
    cancelledAt:
      normalized.status === "CANCELLED" || normalized.status === "EXPIRED"
        ? new Date()
        : null,
  };

  const subscription = existing
    ? await prisma.dealerSubscription.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.dealerSubscription.create({ data });

  await logAppEvent({
    eventType:
      normalized.eventType === "INITIAL_BUY" || !existing
        ? "PURCHASE_SUCCEEDED"
        : "PURCHASE_RENEWED",
    entityType: "DealerSubscription",
    entityId: subscription.id,
    dealerId,
    userId: purchaserUserId ?? undefined,
    metadata: {
      provider: normalized.provider,
      status: normalized.status,
      eventType: normalized.eventType,
    },
  });

  return { subscription, planSlug: product?.plan.slug ?? null };
}
