import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;

  const all = await getEnrichedDemandsForDealer(principal.dealerId, {
    includeHistory: true,
  });
  const demand = all.find((d) => d.id === id);
  if (!demand) return v1Error(ctx, "RESOURCE_NOT_FOUND");
  return v1Json(ctx, demand);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as { confirmed?: unknown };
  if (body.confirmed == null || typeof body.confirmed !== "object") {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const { updateDemandForDealer } = await import(
    "@/services/demand/demand-mutations"
  );
  const result = await updateDemandForDealer({
    dealerId: principal.dealerId,
    demandId: id,
    confirmed: body.confirmed as import("@/lib/demand-display").DemandConfirmed,
  });
  if (!result.ok) {
    return v1Error(
      ctx,
      result.error === "not_found" ? "RESOURCE_NOT_FOUND" : "RESOURCE_CONFLICT"
    );
  }
  return v1Json(ctx, result.demand);
}
