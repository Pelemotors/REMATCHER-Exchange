import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordBuyerInterest } from "@/services/domain/matching-flow";
import { canDealerReveal } from "@/services/commercial/reveal-usage";
import { toBuyerMatchView } from "@/lib/privacy-views";
import type { MatchExplanation } from "@/lib/schemas/ai";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await prisma.candidateMatch.findMany({
    where: {
      demand: { dealerId: session.user.dealerId },
      ...BUYER_VISIBLE_MATCH_WHERE,
    },
    include: {
      vehicle: true,
      buyerInterests: {
        where: { dealerId: session.user.dealerId },
      },
      sellerOpportunities: {
        include: {
          sellerInterest: {
            include: {
              mutualInterest: {
                include: { reveal: { select: { id: true } } },
              },
            },
          },
        },
        take: 1,
      },
    },
    orderBy: { score: "desc" },
    take: 12,
  });

  const safe = matches.map((m) => {
    const revealId =
      m.sellerOpportunities[0]?.sellerInterest?.mutualInterest?.reveal?.id ??
      null;
    return {
      id: m.id,
      status: m.status,
      scoreBand: m.scoreBand,
      explanation: m.explanationJson as MatchExplanation,
      vehicle: toBuyerMatchView(m.vehicle),
      interest: m.buyerInterests[0] ?? null,
      revealId,
    };
  });

  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { matchId, action, rejectReason } = body as {
    matchId: string;
    action: string;
    rejectReason?: string;
  };

  if (action === "request_info") {
    return NextResponse.json(
      {
        error: "buyer_initiated_enrichment_disabled",
        message: "השלמת פרטים מתבצעת על ידי המערכת מול בעל הרכב.",
      },
      { status: 410 }
    );
  }

  const status =
    action === "interested"
      ? "INTERESTED"
      : action === "reject"
        ? "REJECTED"
        : "NO_RESPONSE";

  if (status === "INTERESTED") {
    const allowed = await canDealerReveal(session.user.dealerId);
    if (!allowed) {
      return NextResponse.json(
        { error: "REVEAL_ALLOWANCE_EXHAUSTED", message: "אין חיבורים זמינים" },
        { status: 402 }
      );
    }
  }

  try {
    const result = await recordBuyerInterest({
      candidateMatchId: matchId,
      dealerId: session.user.dealerId,
      userId: session.user.id,
      status,
      rejectReason,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "VEHICLE_UNAVAILABLE") {
      return NextResponse.json(
        { error: "vehicle_unavailable" },
        { status: 409 }
      );
    }
    throw e;
  }
}
