import { prisma } from "@/lib/prisma";
import { publicThumbUrlForDisplayKey } from "@/lib/media/storage";

export async function getVehicleForDealer(dealerId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
    include: {
      media: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          category: true,
          storageKey: true,
          isPrimary: true,
          sortOrder: true,
          createdAt: true,
        },
      },
    },
  });
  if (!vehicle) return null;

  const [openInterestCount, pendingValidationCount] = await Promise.all([
    prisma.sellerOpportunity.count({
      where: { vehicleId: vehicle.id, status: "OPEN" },
    }),
    prisma.validationEvent.count({
      where: { vehicleId: vehicle.id, dealerId, status: "PENDING" },
    }),
  ]);

  const primary = vehicle.media.find((m) => m.isPrimary) ?? vehicle.media[0];

  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    year: vehicle.year,
    mileage: vehicle.mileage,
    color: vehicle.color,
    ownershipHand: vehicle.ownershipHand,
    ownershipType: vehicle.ownershipType,
    retailPrice: vehicle.retailPrice,
    b2bPrice: vehicle.b2bPrice,
    region: vehicle.region,
    status: vehicle.status,
    freshnessState: vehicle.freshnessState,
    mediaReady: vehicle.mediaReady,
    dealerRelationship: vehicle.dealerRelationship,
    visibility: vehicle.visibility,
    conditionNotes: vehicle.conditionNotes,
    updatedAt: vehicle.updatedAt.toISOString(),
    createdAt: vehicle.createdAt.toISOString(),
    openInterestCount,
    pendingValidationCount,
    thumbUrl: primary ? publicThumbUrlForDisplayKey(primary.storageKey) : null,
    media: vehicle.media.map((m) => ({
      id: m.id,
      category: m.category,
      isPrimary: m.isPrimary,
      sortOrder: m.sortOrder,
      url: publicThumbUrlForDisplayKey(m.storageKey),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
