import "server-only";
import { prisma } from "@/lib/prisma";

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
  return prisma.marketWatch.create({
    data: {
      dealerId: input.dealerId,
      userId: input.userId ?? null,
      queryMake: input.queryMake.trim(),
      queryModel: input.queryModel.trim(),
      yearMin: input.yearMin ?? null,
      yearMax: input.yearMax ?? null,
      active: true,
    },
  });
}
