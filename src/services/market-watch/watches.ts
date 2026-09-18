import "server-only";
import { prisma } from "@/lib/prisma";
import {
  canonicalizeMake,
  canonicalizeModel,
} from "@/services/exchange/vehicle-identity";

export function marketWatchCanonicalKey(input: {
  dealerId: string;
  queryMake: string;
  queryModel: string;
  yearMin?: number | null;
  yearMax?: number | null;
}): string {
  const make = canonicalizeMake(input.queryMake) ?? input.queryMake.trim().toLowerCase();
  const model =
    canonicalizeModel(input.queryModel) ?? input.queryModel.trim().toLowerCase();
  return [
    input.dealerId,
    make.toLowerCase(),
    model.toLowerCase(),
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
  const make =
    canonicalizeMake(input.queryMake)?.trim() || input.queryMake.trim();
  const model =
    canonicalizeModel(input.queryModel)?.trim() || input.queryModel.trim();
  const yearMin = input.yearMin ?? null;
  const yearMax = input.yearMax ?? null;

  // Prefer exact match on canonical storage; also scan active watches for same key.
  const active = await prisma.marketWatch.findMany({
    where: { dealerId: input.dealerId, active: true },
  });
  const key = marketWatchCanonicalKey({
    dealerId: input.dealerId,
    queryMake: make,
    queryModel: model,
    yearMin,
    yearMax,
  });
  const existing = active.find(
    (w) =>
      marketWatchCanonicalKey({
        dealerId: w.dealerId,
        queryMake: w.queryMake,
        queryModel: w.queryModel,
        yearMin: w.yearMin,
        yearMax: w.yearMax,
      }) === key
  );
  if (existing) return existing;

  return prisma.marketWatch.create({
    data: {
      dealerId: input.dealerId,
      userId: input.userId ?? null,
      queryMake: make,
      queryModel: model,
      yearMin,
      yearMax,
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
