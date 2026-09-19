import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import {
  getDecisionForVehicle,
  updateOpenDecision,
} from "@/services/decisions/vehicle-decision";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    incomingAskPrice: z.number().int().positive().nullable().optional(),
    incomingAgreedPrice: z.number().int().positive().nullable().optional(),
    outgoingVehicleId: z.string().min(1).max(80).nullable().optional(),
    outgoingAgreedPrice: z.number().int().positive().nullable().optional(),
  })
  .strict();

function decisionErrorStatus(
  error: string
): "RESOURCE_NOT_FOUND" | "RESOURCE_CONFLICT" | "VALIDATION_INVALID_REQUEST" {
  if (error === "not_found" || error === "outgoing_not_found") {
    return "RESOURCE_NOT_FOUND";
  }
  if (error === "decision_terminal") return "RESOURCE_CONFLICT";
  return "VALIDATION_INVALID_REQUEST";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const decision = await getDecisionForVehicle({
    dealerId: principal.dealerId,
    vehicleId,
  });
  if (!decision) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, { decision });
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
  const body = patchSchema.safeParse(parsed.body);
  if (!body.success) return v1Error(ctx, "VALIDATION_INVALID_REQUEST");

  const result = await updateOpenDecision({
    dealerId: principal.dealerId,
    vehicleId,
    ...body.data,
  });
  if (!result.ok) {
    return v1Error(ctx, decisionErrorStatus(result.error), result.error);
  }
  return v1Json(ctx, { decision: result.decision });
}
