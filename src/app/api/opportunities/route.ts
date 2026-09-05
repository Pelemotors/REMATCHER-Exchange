import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordSellerInterest } from "@/services/domain/matching-flow";
import { canDealerReveal } from "@/services/commercial/reveal-usage";
import { toSellerOpportunityView } from "@/lib/privacy-views";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const opps = await prisma.sellerOpportunity.findMany({
    where: { vehicle: { dealerId: session.user.dealerId } },
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

  const safe = opps.map((o) => ({
    id: o.id,
    status: o.status,
    vehicle: {
      make: o.vehicle.make,
      model: o.vehicle.model,
      year: o.vehicle.year,
      trim: o.vehicle.trim,
      // Own vehicle commercial fields stay on Inventory — not needed for Opportunity decision UX
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

  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { opportunityId, action, rejectReason } = await req.json();
  const status =
    action === "interested"
      ? "INTERESTED"
      : action === "reject"
        ? "REJECTED"
        : "NO_RESPONSE";

  if (status === "INTERESTED") {
    const allowed = await canDealerReveal(session.user.dealerId);
    if (!allowed) {
      const opp = await prisma.sellerOpportunity.findFirst({
        where: {
          id: opportunityId,
          vehicle: { dealerId: session.user.dealerId },
        },
        include: { buyerInterest: true },
      });
      if (!opp?.buyerInterest || opp.buyerInterest.status !== "INTERESTED") {
        return NextResponse.json(
          { error: "REVEAL_ALLOWANCE_EXHAUSTED", message: "אין חיבורים זמינים" },
          { status: 402 }
        );
      }
    }
  }

  try {
    const result = await recordSellerInterest({
      opportunityId,
      dealerId: session.user.dealerId,
      userId: session.user.id,
      status,
      rejectReason,
    });

    if (
      result &&
      "error" in result &&
      result.error === "stale_opportunity"
    ) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "VEHICLE_UNAVAILABLE") {
      return NextResponse.json(
        { error: "vehicle_unavailable" },
        { status: 409 }
      );
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
