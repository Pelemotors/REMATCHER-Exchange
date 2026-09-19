import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { getDecisionSnapshot } from "@/services/decisions/decision-snapshot";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id: vehicleId } = await params;
  const snapshot = await getDecisionSnapshot({
    dealerId: principal.dealerId,
    vehicleId,
  });
  if (!snapshot.workspaceActive && snapshot.reason === "not_found") {
    return v1Error(ctx, "RESOURCE_NOT_FOUND");
  }
  return v1Json(ctx, snapshot);
}
