import "server-only";
import { prisma } from "@/lib/prisma";
import { parseDemand } from "@/services/ai/demand-parser";
import {
  confirmedFromParsed,
  findDuplicateDemand,
} from "@/services/demand/duplicate-detection";
import {
  computeDemandExpiry,
  runMatchingForDemand,
} from "@/services/domain/matching-flow";
import { logAppEvent } from "@/services/notifications";
import { getDemandByIdForDealer } from "./read-tools";

export async function createDemandDraft(
  dealerId: string,
  userId: string,
  rawText: string
) {
  const parsed = await parseDemand(rawText, userId);
  const confirmed = confirmedFromParsed(parsed as unknown as Record<string, unknown>);

  const existing = await prisma.demand.findMany({
    where: { dealerId, status: { in: ["ACTIVE", "PENDING_CONFIRMATION", "DRAFT"] } },
    select: { id: true, status: true, confirmedJson: true },
  });

  const dup = findDuplicateDemand(confirmed, existing);
  if (dup.level === "NEARLY_IDENTICAL" && dup.existingDemandId) {
    return {
      ok: true as const,
      duplicate: true,
      level: dup.level,
      existingDemandId: dup.existingDemandId,
      message: "כבר יש לך חיפוש כמעט זהה. עדיף לעדכן את הקיים או לפתוח חדש במפורש.",
      parsed,
    };
  }

  return {
    ok: true as const,
    duplicate: false,
    level: dup.level,
    existingDemandId: dup.existingDemandId,
    message: "טיוטת חיפוש מוכנה לאישור.",
    parsed,
    href: `/demand?new=1&text=${encodeURIComponent(rawText)}`,
  };
}

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

export async function markMyVehicleSold(dealerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" };

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { status: "SOLD", archivedAt: new Date() },
  });

  await logAppEvent({
    eventType: "vehicle_marked_sold",
    entityType: "Vehicle",
    entityId: vehicleId,
    dealerId,
  });

  return { ok: true as const };
}

export async function prepareConfirmValidation(
  dealerId: string,
  validationId: string
) {
  const validation = await prisma.validationEvent.findFirst({
    where: { id: validationId, dealerId, status: "PENDING" },
    include: { vehicle: { select: { make: true, model: true, year: true } } },
  });
  if (!validation) return { ok: false as const, error: "not_found" };
  const title = `${validation.vehicle.make ?? ""} ${validation.vehicle.model ?? ""} ${validation.vehicle.year ?? ""}`.trim();
  return {
    ok: true as const,
    action: "confirm_validation",
    label: `לאשר ש"${title || "הרכב"}" זמין?`,
    payload: { validationId },
  };
}

export async function executeConfirmValidation(
  dealerId: string,
  validationId: string,
  available: boolean
) {
  const { confirmAvailabilityValidation } = await import(
    "@/services/domain/matching-flow"
  );
  await confirmAvailabilityValidation(validationId, dealerId, available);
  return { ok: true as const, available };
}

export async function prepareMarkSold(dealerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
    select: { id: true, make: true, model: true, year: true },
  });
  if (!vehicle) return { ok: false as const, error: "not_found" };
  const title = `${vehicle.make ?? ""} ${vehicle.model ?? ""} ${vehicle.year ?? ""}`.trim();
  return {
    ok: true as const,
    action: "mark_sold",
    label: `לסמן את "${title || "הרכב"}" כנמכר?`,
    payload: { vehicleId },
  };
}
