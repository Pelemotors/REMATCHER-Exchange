/**
 * Agent 4.1 — lightweight proactive attention signals for THIS dealer.
 * Reads existing system flags only; does not invent commercial urgency.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { getExpiringDemandsForDealer } from "@/services/demand/demand-queries";

export type AttentionOpportunity = {
  kind:
    | "expiring_demand"
    | "stale_inventory"
    | "intake_needs_info"
    | "open_match"
    | "open_opportunity"
    | "pending_validation";
  count: number;
  href?: string;
  labelHe: string;
};

export async function listAttentionOpportunities(
  dealerId: string
): Promise<AttentionOpportunity[]> {
  const [
    expiring,
    staleCount,
    intakeNeedsInfo,
    openMatches,
    openOpps,
    pendingValidations,
  ] = await Promise.all([
    getExpiringDemandsForDealer(dealerId),
    prisma.vehicle.count({
      where: { dealerId, status: "ACTIVE", freshnessState: "STALE" },
    }),
    prisma.vehicleCandidate.count({
      where: {
        dealerId,
        status: { in: ["NEEDS_INFO", "NEEDS_CONFIRMATION"] },
      },
    }),
    prisma.candidateMatch.count({
      where: {
        demand: { dealerId },
        status: "VALIDATED",
        buyerInterests: { none: { dealerId } },
      },
    }),
    prisma.sellerOpportunity.count({
      where: { vehicle: { dealerId }, status: "OPEN" },
    }),
    prisma.validationEvent.count({
      where: { dealerId, status: "PENDING" },
    }),
  ]);

  const out: AttentionOpportunity[] = [];
  const expiringCount = Array.isArray(expiring) ? expiring.length : 0;
  if (expiringCount > 0) {
    out.push({
      kind: "expiring_demand",
      count: expiringCount,
      href: "/demand",
      labelHe: `${expiringCount} חיפושים פגים בקרוב`,
    });
  }
  if (staleCount > 0) {
    out.push({
      kind: "stale_inventory",
      count: staleCount,
      href: "/inventory",
      labelHe: `${staleCount} רכבים במלאי דורשים רענון`,
    });
  }
  if (intakeNeedsInfo > 0) {
    out.push({
      kind: "intake_needs_info",
      count: intakeNeedsInfo,
      href: "/intake/review",
      labelHe: `${intakeNeedsInfo} מועמדי קליטה ממתינים להשלמה`,
    });
  }
  if (openMatches > 0) {
    out.push({
      kind: "open_match",
      count: openMatches,
      href: "/matches",
      labelHe: `${openMatches} התאמות לבדיקה`,
    });
  }
  if (openOpps > 0) {
    out.push({
      kind: "open_opportunity",
      count: openOpps,
      href: "/opportunities",
      labelHe: `${openOpps} הזדמנויות פתוחות`,
    });
  }
  if (pendingValidations > 0) {
    out.push({
      kind: "pending_validation",
      count: pendingValidations,
      href: "/validations",
      labelHe: `${pendingValidations} אישורי זמינות ממתינים`,
    });
  }
  return out;
}
