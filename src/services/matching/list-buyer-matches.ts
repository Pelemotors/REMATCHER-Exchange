import { prisma } from "@/lib/prisma";
import { toBuyerMatchView } from "@/lib/privacy-views";
import type { MatchExplanation } from "@/lib/schemas/ai";
import { publicThumbUrlForDisplayKey } from "@/lib/media/storage";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

export interface BuyerMatchListItem {
  id: string;
  demandId: string;
  status: string;
  scoreBand: string | null;
  explanation: MatchExplanation;
  vehicle: ReturnType<typeof toBuyerMatchView>;
  interest: { status: string } | null;
  revealId: string | null;
}

export async function listBuyerMatches(
  dealerId: string,
  options?: { demandId?: string; limit?: number }
): Promise<BuyerMatchListItem[]> {
  const demandId = options?.demandId?.trim() || undefined;
  const limit = options?.limit ?? (demandId ? 40 : 12);

  const matches = await prisma.candidateMatch.findMany({
    where: {
      demand: {
        dealerId,
        ...(demandId ? { id: demandId } : {}),
      },
      ...BUYER_VISIBLE_MATCH_WHERE,
    },
    include: {
      vehicle: {
        include: {
          media: {
            where: { isPrimary: true },
            take: 1,
            select: { storageKey: true },
          },
        },
      },
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
    take: limit,
  });

  return matches.map((m) => {
    const primaryKey = m.vehicle.media[0]?.storageKey ?? null;
    return {
      id: m.id,
      demandId: m.demandId,
      status: m.status,
      scoreBand: m.scoreBand,
      explanation: m.explanationJson as MatchExplanation,
      vehicle: toBuyerMatchView({
        ...m.vehicle,
        imageUrl: primaryKey ? publicThumbUrlForDisplayKey(primaryKey) : null,
      }),
      interest: m.buyerInterests[0]
        ? { status: m.buyerInterests[0].status }
        : null,
      revealId:
        m.sellerOpportunities[0]?.sellerInterest?.mutualInterest?.reveal?.id ??
        null,
    };
  });
}
