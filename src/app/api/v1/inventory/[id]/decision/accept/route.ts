import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { acceptDecision } from "@/services/decisions/vehicle-decision";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    incomingAgreedPrice: z.number().int().positive().optional(),
    outgoingVehicleId: z.string().min(1).max(80).optional(),
    outgoingAgreedPrice: z.number().int().positive().optional(),
  })
  .strict();

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
  const body = bodySchema.safeParse(parsed.body ?? {});
  if (!body.success) return v1Error(ctx, "VALIDATION_INVALID_REQUEST");

  const result = await acceptDecision({
    dealerId: principal.dealerId,
    vehicleId,
    ...body.data,
  });
  if (!result.ok) {
    const code =
      result.error === "not_found"
        ? "RESOURCE_NOT_FOUND"
        : result.error === "decision_declined"
          ? "ACTION_TERMINAL"
          : result.error === "agreed_price_required" ||
              result.error === "outgoing_vehicle_required"
            ? "VALIDATION_INVALID_REQUEST"
            : result.error === "decision_type_changed"
              ? "RESOURCE_CONFLICT"
            : "RESOURCE_CONFLICT";
    return v1Error(ctx, code, result.error);
  }
  return v1Json(ctx, {
    ok: true,
    decision: result.decision,
    idempotent: result.idempotent,
  });
}
