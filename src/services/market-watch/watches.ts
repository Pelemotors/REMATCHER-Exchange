import "server-only";
import { prisma } from "@/lib/prisma";

export function marketWatchCanonicalKey(input: {
  dealerId: string;
  queryMake: string;
  queryModel: string;
  yearMin?: number | null;
  yearMax?: number | null;
}): string {
  return [
    input.dealerId,
    input.queryMake.trim().toLowerCase(),
    input.queryModel.trim().toLowerCase(),
    input.yearMin ?? "",
    input.yearMax ?? "",
  ].join("|");
}

export async function listMarketWatches(dealerId: string) {
  return prisma.marketWatch.findMany({
    where: { dealerId, active: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createMarketWatch(input: {
  dealerId: string;
  userId?: string | null;
  queryMake: string;
  queryModel: string;
  yearMin?: number | null;
  yearMax?: number | null;
}) {
  const make = input.queryMake.trim();
  const model = input.queryModel.trim();
  const existing = await prisma.marketWatch.findFirst({
    where: {
      dealerId: input.dealerId,
      queryMake: make,
      queryModel: model,
      yearMin: input.yearMin ?? null,
      yearMax: input.yearMax ?? null,
      active: true,
    },
  });
  if (existing) return existing;

  return prisma.marketWatch.create({
    data: {
      dealerId: input.dealerId,
      userId: input.userId ?? null,
      queryMake: make,
      queryModel: model,
      yearMin: input.yearMin ?? null,
      yearMax: input.yearMax ?? null,
      active: true,
    },
  });
}

export async function deactivateMarketWatch(input: {
  dealerId: string;
  watchId: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const row = await prisma.marketWatch.findFirst({
    where: { id: input.watchId, dealerId: input.dealerId, active: true },
  });
  if (!row) return { ok: false, error: "not_found" };
  await prisma.marketWatch.update({
    where: { id: row.id },
    data: { active: false },
  });
  return { ok: true };
}

export async function deactivateAllMarketWatchesForDealer(dealerId: string) {
  await prisma.marketWatch.updateMany({
    where: { dealerId, active: true },
    data: { active: false },
  });
}
