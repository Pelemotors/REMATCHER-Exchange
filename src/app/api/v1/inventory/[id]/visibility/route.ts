import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  convertToOwnedInventory,
  publishVehicleToNetwork,
  removeVehicleFromNetwork,
  setVehicleRelationship,
} from "@/services/vehicles/relationship-visibility";
import type { DealerVehicleRelationship } from "@prisma/client";

export const dynamic = "force-dynamic";

const RELATIONSHIPS = new Set<DealerVehicleRelationship>([
  "OWNED",
  "INVENTORY",
  "OFFERED_TO_ME",
  "TRADE_IN_CANDIDATE",
  "EXTERNAL",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    action?: string;
    relationship?: string;
  };
  const dealerId = principal.dealerId;

  if (body.action === "publish") {
    const result = await publishVehicleToNetwork({ dealerId, vehicleId });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "RESOURCE_CONFLICT"
      );
    }
    return v1Json(ctx, result);
  }

  if (body.action === "unpublish") {
    const result = await removeVehicleFromNetwork({ dealerId, vehicleId });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  if (body.action === "convert_owned") {
    const result = await convertToOwnedInventory({ dealerId, vehicleId });
    if (!result.ok) {
      return v1Error(
        ctx,
        result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "RESOURCE_CONFLICT"
      );
    }
    return v1Json(ctx, result);
  }

  if (body.action === "set_relationship") {
    const relationship = body.relationship as DealerVehicleRelationship;
    if (!RELATIONSHIPS.has(relationship)) {
      return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
    }
    const result = await setVehicleRelationship({
      dealerId,
      vehicleId,
      relationship,
    });
    if (!result.ok) {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    return v1Json(ctx, result);
  }

  return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
}
