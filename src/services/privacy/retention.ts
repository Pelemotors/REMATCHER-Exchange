/**
 * Retention policy + safe dry-run cleanup (no blind Production wipe).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { getRetentionPolicy } from "@/services/privacy/policy";

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

function yearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d;
}

export async function retentionDryRun() {
  const policy = getRetentionPolicy();
  const conversationCutoff = monthsAgo(policy.agentConversationsMonths);
  const inventoryCutoff = monthsAgo(policy.historicalInventoryDemandMonths);
  const matchCutoff = monthsAgo(policy.matchInterestRevealMonths);
  const eventCutoff = yearsAgo(policy.exchangeEventsCasesYears);

  const [staleVehicles, staleDemands, staleEvents, staleCases] =
    await Promise.all([
      prisma.vehicle.count({
        where: {
          status: { in: ["SOLD", "ARCHIVED"] },
          updatedAt: { lt: inventoryCutoff },
        },
      }),
      prisma.demand.count({
        where: {
          status: { in: ["EXPIRED", "CANCELLED"] },
          updatedAt: { lt: inventoryCutoff },
        },
      }),
      prisma.exchangeEvent.count({
        where: { occurredAt: { lt: eventCutoff } },
      }),
      prisma.exchangeCase.count({
        where: { createdAt: { lt: eventCutoff } },
      }),
    ]);

  return {
    policy,
    dryRun: true,
    conversationCutoff: conversationCutoff.toISOString(),
    counts: {
      staleVehicles,
      staleDemands,
      staleEvents,
      staleCases,
    },
    note: "Cleanup must be invoked explicitly with confirm=true; never automatic blind wipe.",
  };
}

/** Safe batched cleanup — only when confirm=true. Idempotent. */
export async function runRetentionCleanup(params: {
  confirm: boolean;
  batchSize?: number;
}) {
  if (!params.confirm) {
    return retentionDryRun();
  }
  const policy = getRetentionPolicy();
  const eventCutoff = yearsAgo(policy.exchangeEventsCasesYears);
  const batch = params.batchSize ?? 200;

  const oldEvents = await prisma.exchangeEvent.findMany({
    where: { occurredAt: { lt: eventCutoff } },
    select: { id: true },
    take: batch,
  });
  if (oldEvents.length) {
    await prisma.exchangeEvent.deleteMany({
      where: { id: { in: oldEvents.map((e) => e.id) } },
    });
  }

  return {
    dryRun: false,
    deletedExchangeEvents: oldEvents.length,
    batchSize: batch,
  };
}
