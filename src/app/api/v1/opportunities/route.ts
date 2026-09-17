import { requireV1VerifiedDealer } from "@/lib/api-v1/auth";
import { parseV1Json } from "@/lib/api-v1/parse-json";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { prisma } from "@/lib/prisma";
import { toSellerOpportunityView } from "@/lib/privacy-views";
import { recordSellerInterest } from "@/services/domain/matching-flow";
import { canDealerReveal } from "@/services/commercial/reveal-usage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;

  const opps = await prisma.sellerOpportunity.findMany({
    where: { vehicle: { dealerId: principal.dealerId } },
    include: {
      candidateMatch: { include: { demand: true } },
      vehicle: true,
      sellerInterest: {
        include: {
          mutualInterest: {
            include: { reveal: { select: { id: true } } },
          },
        },
      },
      buyerInterest: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const items = opps.map((o) => ({
    id: o.id,
    status: o.status,
    vehicle: {
      make: o.vehicle.make,
      model: o.vehicle.model,
      year: o.vehicle.year,
      trim: o.vehicle.trim,
    },
    ...toSellerOpportunityView(
      o.candidateMatch.demand,
      o.candidateMatch.evaluationJson
    ),
    explanation: o.candidateMatch.explanationJson,
    sellerInterest: o.sellerInterest
      ? {
          status: o.sellerInterest.status,
          rejectReason: o.sellerInterest.rejectReason,
        }
      : null,
    revealId: o.sellerInterest?.mutualInterest?.reveal?.id ?? null,
  }));

  return v1Json(ctx, { items });
}

export async function POST(req: Request) {
  const auth = await requireV1VerifiedDealer(req);
  if (!auth.ok) return auth.response;
  const { ctx, principal } = auth.auth;
  const parsed = await parseV1Json(req, ctx);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as {
    opportunityId?: unknown;
    action?: unknown;
    rejectReason?: unknown;
  };
  const opportunityId =
    typeof body.opportunityId === "string" ? body.opportunityId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!opportunityId || !["interested", "reject", "no_response"].includes(action)) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const status =
    action === "interested"
      ? ("INTERESTED" as const)
      : action === "reject"
        ? ("REJECTED" as const)
        : ("NO_RESPONSE" as const);

  const rejectReason =
    typeof body.rejectReason === "string" ? body.rejectReason : undefined;

  if (status === "INTERESTED") {
    const allowed = await canDealerReveal(principal.dealerId);
    if (!allowed) {
      const opp = await prisma.sellerOpportunity.findFirst({
        where: {
          id: opportunityId,
          vehicle: { dealerId: principal.dealerId },
        },
        include: { buyerInterest: true },
      });
      if (!opp?.buyerInterest || opp.buyerInterest.status !== "INTERESTED") {
        return v1Error(ctx, "REVEAL_ALLOWANCE_EXHAUSTED");
      }
    }
  }

  try {
    const result = await recordSellerInterest({
      opportunityId,
      dealerId: principal.dealerId,
      userId: principal.userId,
      status,
      rejectReason,
    });

    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      result.error === "stale_opportunity"
    ) {
      return v1Error(ctx, "MATCH_STALE_OPPORTUNITY");
    }

    return v1Json(ctx, result);
  } catch (e) {
    if (e instanceof Error && e.message === "VEHICLE_UNAVAILABLE") {
      return v1Error(ctx, "MATCH_VEHICLE_UNAVAILABLE");
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return v1Error(ctx, "RESOURCE_NOT_FOUND");
    }
    if (e instanceof Error && e.message === "INTEREST_DISABLED") {
      return v1Error(ctx, "RESOURCE_CONFLICT");
    }
    throw e;
  }
}
