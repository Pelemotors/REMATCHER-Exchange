import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordBuyerInterest } from "@/services/domain/matching-flow";
import { canDealerReveal } from "@/services/commercial/reveal-usage";
import { toBuyerMatchView } from "@/lib/privacy-views";
import type { MatchExplanation } from "@/lib/schemas/ai";

export async function GET() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const matches = await prisma.candidateMatch.findMany({
    where: {
      demand: { dealerId: session.user.dealerId },
      status: { in: ["VALIDATED", "PENDING_VALIDATION"] },
      scoreBand: { in: ["STRONG", "ALTERNATIVE"] },
    },
    include: {
      vehicle: true,
      buyerInterests: {
        where: { dealerId: session.user.dealerId },
      },
    },
    orderBy: { score: "desc" },
    take: 4,
  });

  const safe = matches.map((m) => ({
    id: m.id,
    status: m.status,
    scoreBand: m.scoreBand,
    explanation: m.explanationJson as MatchExplanation,
    vehicle: toBuyerMatchView(m.vehicle),
    interest: m.buyerInterests[0] ?? null,
  }));

  return NextResponse.json(safe);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId, action, rejectReason } = await req.json();
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
