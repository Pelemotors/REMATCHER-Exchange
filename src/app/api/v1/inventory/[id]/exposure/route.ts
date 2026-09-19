import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { reconcileCatalogForDealer } from "@/services/catalog/reconcile";
import { getVehicleExposure } from "@/services/vehicles/exposure";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const result = await getVehicleExposure({
    dealerId: principal.dealerId,
    vehicleId,
  });
  if (!result.ok) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, result);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;
  const override = (parsed.body as { catalogOverride?: string }).catalogOverride;
  if (
    override !== "DEFAULT_FROM_POLICY" &&
    override !== "FORCE_EXCLUDE" &&
    override !== "FORCE_INCLUDE"
  ) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId: principal.dealerId },
    select: { id: true },
  });
  if (!vehicle) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { catalogOverride: override },
  });
  await reconcileCatalogForDealer(principal.dealerId);
  const result = await getVehicleExposure({
    dealerId: principal.dealerId,
    vehicleId,
  });
  if (!result.ok) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, result);
}
