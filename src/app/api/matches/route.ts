import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordBuyerInterest } from "@/services/domain/matching-flow";
import { canDealerReveal } from "@/services/commercial/reveal-usage";
import { toBuyerMatchView } from "@/lib/privacy-views";
import { requestCandidateInformation } from "@/services/matching/information-request";
import type { MatchExplanation } from "@/lib/schemas/ai";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await prisma.candidateMatch.findMany({
    where: {
      demand: { dealerId: session.user.dealerId },
      OR: [
        {
          status: { in: ["VALIDATED", "PENDING_VALIDATION"] },
          scoreBand: { in: ["STRONG", "GOOD", "ALTERNATIVE"] },
          resolutionState: "RESOLVED",
        },
        {
          resolutionState: "NEEDS_INFORMATION",
          status: { in: ["CANDIDATE", "PENDING_VALIDATION"] },
        },
      ],
    },
    include: {
      vehicle: true,
      buyerInterests: {
        where: { dealerId: session.user.dealerId },
      },
      informationRequests: {
        where: {
          requesterDealerId: session.user.dealerId,
          status: "OPEN",
        },
        take: 1,
      },
    },
    orderBy: { score: "desc" },
    take: 12,
  });

  const safe = matches.map((m) => {
    const blocking = Array.isArray(m.decisionBlockingUnknowns)
      ? (m.decisionBlockingUnknowns as string[])
      : [];
    return {
      id: m.id,
      status: m.status,
      scoreBand: m.scoreBand,
      resolutionState: m.resolutionState,
      decisionBlockingUnknowns: blocking,
      explanation: m.explanationJson as MatchExplanation,
      vehicle: toBuyerMatchView(m.vehicle),
      interest: m.buyerInterests[0] ?? null,
      infoRequestOpen: Boolean(m.informationRequests[0]),
      potential: m.resolutionState === "NEEDS_INFORMATION",
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
    const result = await requestCandidateInformation({
      requesterDealerId: session.user.dealerId,
      candidateMatchId: matchId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      created: result.created,
      message: result.message,
      // Never return seller identity
      informationRequestId: result.request.id,
    });
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

  const result = await recordBuyerInterest({
    candidateMatchId: matchId,
    dealerId: session.user.dealerId,
    userId: session.user.id,
    status,
    rejectReason,
  });

  return NextResponse.json(result);
}
