import { prisma } from "@/lib/prisma";
import { toBuyerMatchView } from "@/lib/privacy-views";
import { publicThumbUrlForDisplayKey } from "@/lib/media/storage";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

/**
 * Buyer-facing match DTO — pre-Reveal privacy boundary.
 * Must NOT include: score, scoreBand, explanation, dealerId, b2bPrice,
 * seller identity/contact, validation internals.
 */
export interface BuyerMatchListItem {
  id: string;
  demandId: string;
  status: string;
  vehicle: ReturnType<typeof toBuyerMatchView>;
  interest: { status: string } | null;
  revealId: string | null;
}

const buyerMatchInclude = (dealerId: string) => ({
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
});

function mapBuyerMatch(
  m: {
    id: string;
    demandId: string;
    status: string;
    vehicle: Parameters<typeof toBuyerMatchView>[0] & {
      media: Array<{ storageKey: string }>;
    };
    buyerInterests: Array<{ status: string }>;
    sellerOpportunities: Array<{
      sellerInterest: {
        mutualInterest: { reveal: { id: string } | null } | null;
      } | null;
    }>;
  }
): BuyerMatchListItem {
  const primaryKey = m.vehicle.media[0]?.storageKey ?? null;
  return {
    id: m.id,
    demandId: m.demandId,
    status: m.status,
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
}

export async function listBuyerMatches(
  dealerId: string,
  options?: { demandId?: string; limit?: number; skip?: number }
): Promise<BuyerMatchListItem[]> {
  const demandId = options?.demandId?.trim() || undefined;
  const limit = options?.limit ?? (demandId ? 40 : 12);
  const skip = Math.max(0, options?.skip ?? 0);

  const matches = await prisma.candidateMatch.findMany({
    where: {
      demand: {
        dealerId,
        ...(demandId ? { id: demandId } : {}),
      },
      ...BUYER_VISIBLE_MATCH_WHERE,
    },
    include: buyerMatchInclude(dealerId),
    orderBy: { score: "desc" },
    skip,
    take: limit,
  });

  return matches.map(mapBuyerMatch);
}

export async function getBuyerMatchForDealer(
  dealerId: string,
  matchId: string
): Promise<BuyerMatchListItem | null> {
  const match = await prisma.candidateMatch.findFirst({
    where: {
      id: matchId,
      demand: { dealerId },
      ...BUYER_VISIBLE_MATCH_WHERE,
    },
    include: buyerMatchInclude(dealerId),
  });
  if (!match) return null;
  return mapBuyerMatch(match);
}
