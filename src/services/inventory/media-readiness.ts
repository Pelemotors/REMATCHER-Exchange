import "server-only";
import { prisma } from "@/lib/prisma";

export async function refreshVehicleMediaReady(vehicleId: string) {
  const [exterior, interior, vehicle] = await Promise.all([
    prisma.vehicleMedia.count({
      where: { vehicleId, category: "EXTERIOR", type: "IMAGE" },
    }),
    prisma.vehicleMedia.count({
      where: { vehicleId, category: "INTERIOR", type: "IMAGE" },
    }),
    prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, dealerId: true, mediaReady: true, status: true },
    }),
  ]);
  const mediaReady = exterior >= 1 && interior >= 1;
  if (!vehicle) return { mediaReady, exterior, interior };

  const becameReady = mediaReady && !vehicle.mediaReady;
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { mediaReady },
  });

  if (becameReady && vehicle.status === "ACTIVE") {
    const { rematchAfterInventoryMutation } = await import(
      "@/services/matching/inventory-rematch"
    );
    await rematchAfterInventoryMutation({
      vehicleId: vehicle.id,
      sellerDealerId: vehicle.dealerId,
    }).catch(() => undefined);
  }

  return { mediaReady, exterior, interior };
}

export async function getVehiclePrimaryThumbKey(vehicleId: string) {
  const primary = await prisma.vehicleMedia.findFirst({
    where: { vehicleId, isPrimary: true, type: "IMAGE" },
    select: { storageKey: true },
  });
  if (primary) return primary.storageKey;
  const first = await prisma.vehicleMedia.findFirst({
    where: { vehicleId, type: "IMAGE" },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { storageKey: true },
  });
  return first?.storageKey ?? null;
}
