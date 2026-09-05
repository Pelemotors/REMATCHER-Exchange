import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireDealer() {
  const user = await requireAuth();
  if (!user.dealerId) throw new Error("NO_DEALER");
  return { user, dealerId: user.dealerId };
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function assertDealerOwnsVehicle(
  dealerId: string,
  vehicleId: string
) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
  });
  if (!vehicle) throw new Error("FORBIDDEN");
  return vehicle;
}

export async function assertDealerOwnsDemand(
  dealerId: string,
  demandId: string
) {
  const demand = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
  });
  if (!demand) throw new Error("FORBIDDEN");
  return demand;
}

/** Privacy: buyer can only see match if they own the demand */
export async function assertBuyerMatchAccess(
  dealerId: string,
  candidateMatchId: string
) {
  const { BUYER_VISIBLE_MATCH_WHERE } = await import(
    "@/services/domain/candidate-policy"
  );
  const match = await prisma.candidateMatch.findFirst({
    where: {
      id: candidateMatchId,
      demand: { dealerId },
      ...BUYER_VISIBLE_MATCH_WHERE,
    },
    include: { demand: true, vehicle: true },
  });
  if (!match) throw new Error("FORBIDDEN");
  return match;
}

/** Privacy: seller can only see opportunity for their vehicle */
export async function assertSellerOpportunityAccess(
  dealerId: string,
  opportunityId: string
) {
  const opp = await prisma.sellerOpportunity.findFirst({
    where: {
      id: opportunityId,
      vehicle: { dealerId },
    },
    include: {
      candidateMatch: { include: { demand: true } },
      vehicle: true,
      buyerInterest: true,
    },
  });
  if (!opp) throw new Error("FORBIDDEN");
  return opp;
}
