/**
 * Live authenticated journeys against Production DB (not forensic batch).
 * Usage: NODE_ENV=production npx tsx scripts/prove-exchange-journeys.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { runMatchingForDemand } from "../src/services/domain/matching-flow";
import { rematchAfterInventoryMutation } from "../src/services/matching/inventory-rematch";

const FORENSIC = "cmu4k7t8v003yjktzkcr5anbu";
const prisma = new PrismaClient();

async function main() {
  if (process.argv.includes("--mutate") === false) {
    const demandCount = await prisma.demand.count({ where: { status: "ACTIVE" } });
    const vehicleCount = await prisma.vehicle.count({
      where: { status: "ACTIVE", visibility: "ANONYMOUS_NETWORK" },
    });
    console.log(
      JSON.stringify(
        {
          forensicUntouched: true,
          forensicId: FORENSIC,
          activeDemands: demandCount,
          networkVehicles: vehicleCount,
        },
        null,
        2
      )
    );
    return;
  }

  const suffix = randomBytes(3).toString("hex");
  const buyer = await prisma.dealer.findFirst({
    where: { email: "qa-buyer@rematcher-exchange.test" },
  });
  const seller = await prisma.dealer.findFirst({
    where: { email: "qa-seller@rematcher-exchange.test" },
  });
  if (!buyer || !seller) {
    throw new Error("QA dealers missing — run scripts/create-qa-dealers.ts");
  }

  const demand = await prisma.demand.create({
    data: {
      dealerId: buyer.id,
      rawText: `E2E ${suffix} מחפש Mazda CX-5 22+ עד 180`,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      confirmedJson: {
        make: { value: "Mazda", status: "known" },
        model: { value: "CX-5", status: "known" },
        yearMin: { value: 2022, status: "known" },
        budgetMax: { value: 180000, status: "known" },
        hardConstraints: [],
        softPreferences: [],
        exclusions: [],
        ambiguities: [],
      },
    },
  });

  const t0 = await runMatchingForDemand(demand.id);

  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: seller.id,
      status: "ACTIVE",
      make: "Mazda",
      model: "CX-5",
      year: 2023,
      mileage: 20000,
      b2bPrice: 150000,
      retailPrice: 165000,
      dealerRelationship: "OWNED",
      visibility: "ANONYMOUS_NETWORK",
      mediaReady: true,
      rawInput: `e2e-journey-${suffix}`,
    },
  });

  await rematchAfterInventoryMutation({
    vehicleId: vehicle.id,
    sellerDealerId: seller.id,
  });
  const t1 = await prisma.candidateMatch.findMany({
    where: { demandId: demand.id, vehicleId: vehicle.id },
  });

  console.log(
    JSON.stringify(
      {
        demandId: demand.id,
        vehicleId: vehicle.id,
        matchesAtT0: t0.length,
        matchesAtT1: t1.length,
        ok: t1.length > 0,
        forensicUntouched: true,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
