/**
 * Retention policy + safe dry-run cleanup (no blind Production wipe).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { getRetentionPolicy } from "@/services/privacy/policy";
import { safeDeleteIntakeStorageKey } from "@/services/intake/batch";

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

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export async function retentionDryRun() {
  const policy = getRetentionPolicy();
  const conversationCutoff = monthsAgo(policy.agentConversationsMonths);
  const inventoryCutoff = monthsAgo(policy.historicalInventoryDemandMonths);
  const matchCutoff = monthsAgo(policy.matchInterestRevealMonths);
  const eventCutoff = yearsAgo(policy.exchangeEventsCasesYears);
  const intakeCutoff = daysAgo(policy.intakeMediaDaysAfterTerminal);

  const [
    staleVehicles,
    staleDemands,
    staleEvents,
    staleCases,
    staleIntakeBatches,
  ] = await Promise.all([
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
    prisma.intakeBatch.count({
      where: {
        status: { in: ["COMMITTED", "FAILED"] },
        updatedAt: { lt: intakeCutoff },
      },
    }),
  ]);

  return {
    policy,
    dryRun: true,
    conversationCutoff: conversationCutoff.toISOString(),
    matchCutoff: matchCutoff.toISOString(),
    intakeCutoff: intakeCutoff.toISOString(),
    counts: {
      staleVehicles,
      staleDemands,
      staleEvents,
      staleCases,
      staleIntakeBatches,
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
  const intakeCutoff = daysAgo(policy.intakeMediaDaysAfterTerminal);
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

  const intakeDeleted = await purgeTerminalIntakeBatches({
    cutoff: intakeCutoff,
    limit: batch,
  });

  return {
    dryRun: false,
    deletedExchangeEvents: oldEvents.length,
    deletedIntakeBatches: intakeDeleted.batches,
    deletedIntakeMediaFiles: intakeDeleted.files,
    batchSize: batch,
  };
}

/** Deletes storage + DB rows for terminal IntakeBatches older than cutoff. */
export async function purgeTerminalIntakeBatches(input: {
  cutoff: Date;
  limit: number;
}) {
  const batches = await prisma.intakeBatch.findMany({
    where: {
      status: { in: ["COMMITTED", "FAILED"] },
      updatedAt: { lt: input.cutoff },
    },
    select: {
      id: true,
      dealerId: true,
      media: { select: { storageKey: true } },
    },
    take: input.limit,
  });

  let files = 0;
  for (const b of batches) {
    for (const m of b.media) {
      try {
        await safeDeleteIntakeStorageKey(b.dealerId, m.storageKey);
        files += 1;
      } catch {
        // continue
      }
    }
    await prisma.intakeBatch.delete({ where: { id: b.id } });
  }
  return { batches: batches.length, files };
}
