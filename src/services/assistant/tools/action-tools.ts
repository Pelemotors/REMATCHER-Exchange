import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { logAppEvent } from "@/services/notifications";
import { getDemandByIdForDealer } from "./read-tools";

export async function prepareDemandRenewal(dealerId: string, demandId: string) {
  const demand = await getDemandByIdForDealer(dealerId, demandId);
  if (!demand) return { ok: false as const, error: "not_found" };
  return {
    ok: true as const,
    action: "renew_demand",
    label: `לחדש את החיפוש "${demand.title}"?`,
    payload: { demandId },
  };
}

export async function executeDemandRenewal(dealerId: string, demandId: string) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) return { ok: false as const, error: "not_found" };

  await prisma.demand.update({
    where: { id: demandId },
    data: {
      status: "ACTIVE",
      expiresAt: computeDemandExpiry(),
      renewedAt: new Date(),
    },
  });

  await logAppEvent({
    eventType: "demand_renewed",
    entityType: "Demand",
    entityId: demandId,
    dealerId,
  });

  await runMatchingForDemand(demandId);

  const verified = await getDemandByIdForDealer(dealerId, demandId);
  return { ok: true as const, demand: verified };
}

export async function prepareDemandClosure(dealerId: string, demandId: string) {
  const demand = await getDemandByIdForDealer(dealerId, demandId);
  if (!demand) return { ok: false as const, error: "not_found" };
  return {
    ok: true as const,
    action: "close_demand",
    label: `לסגור את החיפוש "${demand.title}"?`,
    payload: { demandId },
  };
}

export async function executeDemandClosure(dealerId: string, demandId: string) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) return { ok: false as const, error: "not_found" };

  await prisma.demand.update({
    where: { id: demandId },
    data: { status: "CANCELLED" },
  });

  await logAppEvent({
    eventType: "demand_closed",
    entityType: "Demand",
    entityId: demandId,
    dealerId,
  });

  return { ok: true as const };
}
