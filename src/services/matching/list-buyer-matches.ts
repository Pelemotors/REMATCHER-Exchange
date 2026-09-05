import { prisma } from "@/lib/prisma";
import { toBuyerMatchView } from "@/lib/privacy-views";
import type { MatchExplanation } from "@/lib/schemas/ai";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

export interface BuyerMatchListItem {
  id: string;
  status: string;
  scoreBand: string | null;
  explanation: MatchExplanation;
  vehicle: ReturnType<typeof toBuyerMatchView>;
  interest: { status: string } | null;
  revealId: string | null;
}

export async function listBuyerMatches(dealerId: string): Promise<BuyerMatchListItem[]> {
  const matches = await prisma.candidateMatch.findMany({
    where: {
      demand: { dealerId },
      ...BUYER_VISIBLE_MATCH_WHERE,
    },
    include: {
      vehicle: true,
      buyerInterests: { where: { dealerId } },
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

  return matches.map((m) => ({
    id: m.id,
    status: m.status,
    scoreBand: m.scoreBand,
    explanation: m.explanationJson as MatchExplanation,
    vehicle: toBuyerMatchView(m.vehicle),
    interest: m.buyerInterests[0] ? { status: m.buyerInterests[0].status } : null,
    revealId: m.sellerOpportunities[0]?.sellerInterest?.mutualInterest?.reveal?.id ?? null,
  }));
}
