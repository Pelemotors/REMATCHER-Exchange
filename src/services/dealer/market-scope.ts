import "server-only";
import { prisma } from "@/lib/prisma";

export async function dealerAllowsSyntheticMarket(
  dealerId: string
): Promise<boolean> {
  const row = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { canAccessSyntheticMarket: true },
  });
  return row?.canAccessSyntheticMarket ?? false;
}

/** Network-visible demands from other dealers (excludes synthetic unless beta). */
export function networkDemandWhere(
  excludeDealerId: string,
  allowSyntheticMarket: boolean
) {
  return {
    status: "ACTIVE" as const,
    networkVisibility: "ANONYMOUS_NETWORK" as const,
    dealerId: { not: excludeDealerId },
    ...(allowSyntheticMarket
      ? {}
      : { dealer: { marketMode: { not: "SYNTHETIC" as const } } }),
  };
}
