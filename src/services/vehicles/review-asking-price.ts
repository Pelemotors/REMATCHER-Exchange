/**
 * After a Decision exists it is the price authority.
 * Candidate commercialJson is seed/fallback only — never b2bPrice/retailPrice.
 */
export function reviewAskingPriceFromCommercial(
  commercial: unknown
): number | null {
  if (!commercial || typeof commercial !== "object") return null;
  const row = commercial as Record<string, unknown>;
  for (const key of ["offeredPrice", "askingPrice"] as const) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
  }
  return null;
}

export async function loadReviewAskingPriceForVehicle(input: {
  dealerId: string;
  vehicleId: string;
}): Promise<number | null> {
  const { loadDecisionAuthorityPrice } = await import(
    "@/services/decisions/vehicle-decision"
  );
  const fromDecision = await loadDecisionAuthorityPrice(input);
  if (fromDecision != null && fromDecision > 0) return fromDecision;

  const { prisma } = await import("@/lib/prisma");
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: {
      dealerId: input.dealerId,
      committedVehicleId: input.vehicleId,
    },
    select: { commercialJson: true },
    orderBy: { updatedAt: "desc" },
  });
  return reviewAskingPriceFromCommercial(candidate?.commercialJson);
}

export async function persistReviewAskingPrice(input: {
  dealerId: string;
  vehicleId: string;
  price: number;
}): Promise<number | null> {
  if (!Number.isFinite(input.price) || input.price <= 0) return null;
  const price = Math.round(input.price);
  const { persistDecisionPrice } = await import(
    "@/services/decisions/vehicle-decision"
  );
  const saved = await persistDecisionPrice({
    dealerId: input.dealerId,
    vehicleId: input.vehicleId,
    price,
  });
  if (saved != null) return saved;

  const { prisma } = await import("@/lib/prisma");
  const { toPrismaJson } = await import("@/lib/prisma-json");
  const candidate = await prisma.vehicleCandidate.findFirst({
    where: {
      dealerId: input.dealerId,
      committedVehicleId: input.vehicleId,
    },
    select: { id: true, commercialJson: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!candidate) return null;
  const prev = (candidate.commercialJson ?? {}) as Record<string, unknown>;
  await prisma.vehicleCandidate.update({
    where: { id: candidate.id },
    data: {
      commercialJson: toPrismaJson({
        ...prev,
        askingPrice: price,
        offeredPrice: price,
      }),
    },
  });
  return price;
}
