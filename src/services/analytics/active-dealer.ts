import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Canonical Active Dealer definition (v1):
 * VERIFIED dealer with at least one meaningful activity signal in the last 30 days:
 * - active inventory OR active demand OR
 * - buyer/seller interest OR reveal OR outcome OR
 * - AppEvent with dealerId in period
 *
 * Centralized here so Admin screens share one definition.
 */
export async function getActiveDealerIds(withinDays = 30): Promise<string[]> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  const [
    inventoryDealers,
    demandDealers,
    interestDealers,
    revealDealers,
    eventDealers,
  ] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "ACTIVE", updatedAt: { gte: since } },
      select: { dealerId: true },
      distinct: ["dealerId"],
    }),
    prisma.demand.findMany({
      where: { status: "ACTIVE", updatedAt: { gte: since } },
      select: { dealerId: true },
      distinct: ["dealerId"],
    }),
    prisma.buyerInterest.findMany({
      where: { createdAt: { gte: since } },
      select: { dealerId: true },
      distinct: ["dealerId"],
    }),
    prisma.reveal.findMany({
      where: { revealedAt: { gte: since } },
      select: { buyerDealerId: true, sellerDealerId: true },
    }),
    prisma.appEvent.findMany({
      where: { dealerId: { not: null }, createdAt: { gte: since } },
      select: { dealerId: true },
      distinct: ["dealerId"],
    }),
  ]);

  const ids = new Set<string>();
  for (const r of inventoryDealers) ids.add(r.dealerId);
  for (const r of demandDealers) ids.add(r.dealerId);
  for (const r of interestDealers) ids.add(r.dealerId);
  for (const r of revealDealers) {
    ids.add(r.buyerDealerId);
    ids.add(r.sellerDealerId);
  }
  for (const r of eventDealers) {
    if (r.dealerId) ids.add(r.dealerId);
  }

  const verified = await prisma.dealer.findMany({
    where: {
      id: { in: [...ids] },
      verificationStatus: "VERIFIED",
      isActive: true,
    },
    select: { id: true },
  });

  return verified.map((d) => d.id);
}

export async function countActiveDealers(withinDays = 30): Promise<number> {
  const ids = await getActiveDealerIds(withinDays);
  return ids.length;
}

export const ACTIVE_DEALER_DEFINITION = {
  version: 1,
  windowDays: 30,
  requires: "VERIFIED + isActive + at least one activity signal in window",
  signals: [
    "active inventory update",
    "active demand update",
    "buyer interest",
    "reveal (buyer or seller)",
    "dealer-scoped AppEvent",
  ],
} as const;
