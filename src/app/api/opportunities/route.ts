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
      sellerInterest: true,
      buyerInterest: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const safe = opps.map((o) => ({
    id: o.id,
    status: o.status,
    vehicle: {
      year: o.vehicle.year,
      trim: o.vehicle.trim,
      b2bPrice: o.vehicle.b2bPrice,
    },
    ...toSellerOpportunityView(
      o.candidateMatch.demand,
      o.candidateMatch.evaluationJson
    ),
    explanation: o.candidateMatch.explanationJson,
    sellerInterest: o.sellerInterest,
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

  const result = await recordSellerInterest({
    opportunityId,
    dealerId: session.user.dealerId,
    userId: session.user.id,
    status,
    rejectReason,
  });

  return NextResponse.json(result);
}
