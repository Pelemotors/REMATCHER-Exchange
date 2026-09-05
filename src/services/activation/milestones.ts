/**
 * Pilot Activation milestones — analytics only, never authorization.
 * Idempotent FIRST_* recording via AppEvent.idempotencyKey.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/services/events/log-event";
import { isTestAccountEmail } from "@/config/accounts";

export const ACTIVATION_MILESTONES = [
  "DEALER_SIGNED_UP",
  "EMAIL_VERIFIED",
  "DEALER_VERIFIED",
  "FIRST_INVENTORY_CREATED",
  "FIRST_INVENTORY_IMPORT_COMPLETED",
  "FIRST_PRIVATE_PRICE_SET",
  "FIRST_DEMAND_CREATED",
  "FIRST_DEMAND_ACTIVATED",
  "FIRST_MATCH_PRESENTED",
  "FIRST_BUYER_INTEREST",
  "FIRST_SELLER_OPPORTUNITY",
  "FIRST_MUTUAL_INTEREST",
  "FIRST_REVEAL",
  "FIRST_REPORTED_DEAL",
] as const;

export type ActivationMilestone = (typeof ACTIVATION_MILESTONES)[number];

function milestoneKey(dealerId: string, milestone: ActivationMilestone) {
  return `activation:${milestone}:${dealerId}`;
}

export async function recordActivationMilestone(params: {
  dealerId: string;
  milestone: ActivationMilestone;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ created: boolean }> {
  const result = await logEvent({
    eventType: `activation_${params.milestone.toLowerCase()}`,
    entityType: params.entityType ?? "Dealer",
    entityId: params.entityId ?? params.dealerId,
    dealerId: params.dealerId,
    userId: params.userId ?? undefined,
    source: "activation",
    idempotencyKey: milestoneKey(params.dealerId, params.milestone),
    metadata: {
      milestone: params.milestone,
      ...(params.metadata ?? {}),
    },
  });
  return { created: result.created };
}

/** Resolve owner emails for a dealer — used only for TEST exclusion in metrics. */
export async function dealerHasTestOwner(dealerId: string): Promise<boolean> {
  const members = await prisma.dealerMembership.findMany({
    where: { dealerId },
    include: { user: { select: { email: true } } },
    take: 10,
  });
  return members.some((m) => isTestAccountEmail(m.user.email));
}

export async function getActivationMilestoneMap(
  dealerId: string
): Promise<Partial<Record<ActivationMilestone, Date>>> {
  const rows = await prisma.appEvent.findMany({
    where: {
      dealerId,
      source: "activation",
      idempotencyKey: { startsWith: `activation:` },
    },
    select: { eventType: true, createdAt: true, metadataJson: true },
  });
  const out: Partial<Record<ActivationMilestone, Date>> = {};
  for (const row of rows) {
    const meta = row.metadataJson as { milestone?: string } | null;
    const name = (meta?.milestone ??
      row.eventType.replace(/^activation_/, "").toUpperCase()) as ActivationMilestone;
    if (ACTIVATION_MILESTONES.includes(name) && !out[name]) {
      out[name] = row.createdAt;
    }
  }
  return out;
}
