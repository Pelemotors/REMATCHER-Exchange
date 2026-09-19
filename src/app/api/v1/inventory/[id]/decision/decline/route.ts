import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { declineDecision } from "@/services/decisions/vehicle-decision";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const result = await declineDecision({
    dealerId: principal.dealerId,
    vehicleId,
  });
  if (!result.ok) {
    const code =
      result.error === "not_found"
        ? "RESOURCE_NOT_FOUND"
        : result.error === "decision_accepted"
          ? "ACTION_TERMINAL"
          : "RESOURCE_CONFLICT";
    return v1Error(ctx, code, result.error);
  }
  return v1Json(ctx, {
    ok: true,
    decision: result.decision,
    idempotent: result.idempotent,
  });
}
