import { z } from "zod";
import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { recordBuyerInterest } from "@/services/domain/matching-flow";
import { canDealerReveal } from "@/services/commercial/reveal-usage";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["interested", "reject"]),
  rejectReason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const status = parsed.data.action === "interested" ? "INTERESTED" : "REJECTED";
  if (status === "INTERESTED") {
    const allowed = await canDealerReveal(principal.dealerId);
    if (!allowed) return v1Error(ctx, "REVEAL_ALLOWANCE_EXHAUSTED");
  }

  try {
    const result = await recordBuyerInterest({
      candidateMatchId: id,
      dealerId: principal.dealerId,
      userId: principal.userId,
      status,
      rejectReason: parsed.data.rejectReason,
    });
    return v1Json(ctx, result);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    if (e instanceof Error && e.message === "VEHICLE_UNAVAILABLE") {
      return v1Error(ctx, "MATCH_VEHICLE_UNAVAILABLE");
    }
    if (e instanceof Error && e.message === "INTEREST_DISABLED") {
      return v1Error(ctx, "RESOURCE_CONFLICT");
    }
    throw e;
  }
}
