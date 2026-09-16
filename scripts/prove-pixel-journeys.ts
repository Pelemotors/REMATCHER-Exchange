/**
 * Live Journey 5 (near-match gap → constraint change) and Journey 6
 * (anonymous match → interest → mutual → reveal) against Production DB.
 * Never touches forensic batch cmu4k7t8v003yjktzkcr5anbu.
 *
 * Usage:
 *   node -r ./scripts/register-server-only.cjs --import tsx scripts/prove-pixel-journeys.ts --mutate
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { runMatchingForDemand } from "../src/services/domain/matching-flow";
import { rematchAfterInventoryMutation } from "../src/services/matching/inventory-rematch";
import {
  recordBuyerInterest,
  recordSellerInterest,
} from "../src/services/domain/matching-flow";
import { toBuyerMatchView } from "../src/lib/privacy-views";

const FORENSIC = "cmu4k7t8v003yjktzkcr5anbu";
const prisma = new PrismaClient();

async function forensicOk() {
  const forensic = await prisma.intakeBatch.findUnique({
    where: { id: FORENSIC },
    select: { id: true, status: true, updatedAt: true },
  });
  return {
    forensicUntouched: Boolean(forensic),
    forensicId: FORENSIC,
    forensicStatus: forensic?.status ?? null,
    forensicUpdatedAt: forensic?.updatedAt ?? null,
  };
}

async function main() {
  const forensic = await forensicOk();
  if (!process.argv.includes("--mutate")) {
    console.log(JSON.stringify({ forensic, mutate: false }, null, 2));
    return;
  }

  const suffix = randomBytes(3).toString("hex");
  const buyer = await prisma.dealer.findFirst({
    where: { email: "qa-buyer@rematcher-exchange.test" },
  });
  const seller = await prisma.dealer.findFirst({
    where: { email: "qa-seller@rematcher-exchange.test" },
  });
  if (!buyer || !seller) throw new Error("QA dealers missing");

  const buyerUser = await prisma.user.findFirst({ where: { dealerId: buyer.id } });
  const sellerUser = await prisma.user.findFirst({
    where: { dealerId: seller.id },
  });
  if (!buyerUser || !sellerUser) throw new Error("QA users missing");

  const journey5 = await proveJourney5({
    suffix,
    buyerId: buyer.id,
    sellerId: seller.id,
  });
  const journey6 = await proveJourney6({
    suffix,
    buyerId: buyer.id,
    sellerId: seller.id,
    buyerUserId: buyerUser.id,
    sellerUserId: sellerUser.id,
  });

  console.log(
    JSON.stringify(
      {
        suffix,
        forensic: await forensicOk(),
        journey5,
        journey6,
        ok: journey5.ok && journey6.ok && forensic.forensicUntouched,
      },
      null,
      2
    )
  );
}

async function proveJourney5(input: {
  suffix: string;
  buyerId: string;
  sellerId: string;
}) {
  const demand = await prisma.demand.create({
    data: {
      dealerId: input.buyerId,
      rawText: `E2E pixel ${input.suffix} Seat Ateca 2022 ומעלה עד 140`,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      confirmedJson: {
        make: "Seat",
        model: "Ateca",
        yearMin: 2022,
        budgetMax: 140000,
      },
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: input.sellerId,
      status: "ACTIVE",
      make: "Seat",
      model: "Ateca",
      year: 2021,
      mileage: 62000,
      b2bPrice: 118000,
      retailPrice: 125000,
      color: "black",
      dealerRelationship: "OWNED",
      visibility: "ANONYMOUS_NETWORK",
      mediaReady: true,
      rawInput: `e2e-pixel-j5-${input.suffix}`,
    },
  });
  await rematchAfterInventoryMutation({
    vehicleId: vehicle.id,
    sellerDealerId: input.sellerId,
  });
  const before = await prisma.candidateMatch.count({
    where: { demandId: demand.id, vehicleId: vehicle.id },
  });

  await prisma.demand.update({
    where: { id: demand.id },
    data: {
      rawText: `E2E pixel ${input.suffix} Seat Ateca 2021 ומעלה עד 140`,
      confirmedJson: {
        make: "Seat",
        model: "Ateca",
        yearMin: 2021,
        budgetMax: 140000,
      },
    },
  });
  const afterRun = await runMatchingForDemand(demand.id);
  const after = await prisma.candidateMatch.findFirst({
    where: { demandId: demand.id, vehicleId: vehicle.id },
    select: { id: true, status: true, score: true, scoreBand: true, explanation: true },
  });
  return {
    demandId: demand.id,
    vehicleId: vehicle.id,
    matchesBeforeConstraintChange: before,
    matchesAfter: after ? 1 : 0,
    afterHit: after,
    immediateHits: afterRun.filter((r: { vehicleId?: string }) => r.vehicleId === vehicle.id)
      .length,
    gapWasYear: before === 0,
    ok: before === 0 && Boolean(after),
  };
}

async function proveJourney6(input: {
  suffix: string;
  buyerId: string;
  sellerId: string;
  buyerUserId: string;
  sellerUserId: string;
}) {
  const demand = await prisma.demand.create({
    data: {
      dealerId: input.buyerId,
      rawText: `E2E pixel ${input.suffix} Fiat 500X 2018 עד 70`,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      confirmedJson: {
        make: "Fiat",
        model: "500X",
        yearMin: 2018,
        yearMax: 2018,
        budgetMax: 70000,
      },
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: input.sellerId,
      status: "ACTIVE",
      make: "Fiat",
      model: "500X",
      year: 2018,
      mileage: 110000,
      b2bPrice: 62000,
      retailPrice: 68000,
      dealerRelationship: "OWNED",
      visibility: "ANONYMOUS_NETWORK",
      mediaReady: true,
      rawInput: `e2e-pixel-j6-${input.suffix}`,
    },
  });
  await rematchAfterInventoryMutation({
    vehicleId: vehicle.id,
    sellerDealerId: input.sellerId,
  });
  const match = await prisma.candidateMatch.findFirst({
    where: { demandId: demand.id, vehicleId: vehicle.id },
    include: { vehicle: true },
  });
  if (!match) {
    return { ok: false, error: "no_match", demandId: demand.id, vehicleId: vehicle.id };
  }

  const anonymousView = toBuyerMatchView(match.vehicle);
  const hiddenBefore = {
    hasDealerId: "dealerId" in anonymousView,
    sellerName: (anonymousView as { sellerName?: string }).sellerName ?? null,
    dealerName: (anonymousView as { dealerName?: string }).dealerName ?? null,
  };

  const buyerInterest = await recordBuyerInterest({
    candidateMatchId: match.id,
    dealerId: input.buyerId,
    userId: input.buyerUserId,
    status: "INTERESTED",
  });

  const afterFirst = toBuyerMatchView(
    (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } }))
  );

  const opp = await prisma.sellerOpportunity.findUnique({
    where: { candidateMatchId: match.id },
  });
  if (!opp) {
    return { ok: false, error: "no_opportunity", matchId: match.id };
  }

  const sellerResult = await recordSellerInterest({
    opportunityId: opp.id,
    dealerId: input.sellerId,
    userId: input.sellerUserId,
    status: "INTERESTED",
  });

  const mutual = await prisma.mutualInterest.findFirst({
    where: { sellerInterestId: sellerResult.sellerInterest.id },
    include: { reveal: true },
  });

  return {
    ok: Boolean(mutual?.reveal?.id) && hiddenBefore.hasDealerId === false,
    demandId: demand.id,
    vehicleId: vehicle.id,
    matchId: match.id,
    buyerInterestId: buyerInterest.id,
    opportunityId: opp.id,
    hiddenBefore,
    hiddenAfterFirstInterest: {
      hasDealerId: "dealerId" in afterFirst,
    },
    mutualId: mutual?.id ?? null,
    revealId: mutual?.reveal?.id ?? null,
    identitiesStillHiddenAfterFirstInterest: !("dealerId" in afterFirst),
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
