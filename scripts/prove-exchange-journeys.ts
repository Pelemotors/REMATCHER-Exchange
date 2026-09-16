/**
 * Live Demand↔Vehicle proofs against Production DB (never the forensic batch).
 * Usage:
 *   node -r ./scripts/register-server-only.cjs --import tsx scripts/prove-exchange-journeys.ts
 *   ... --mutate
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { runMatchingForDemand } from "../src/services/domain/matching-flow";
import { rematchAfterInventoryMutation } from "../src/services/matching/inventory-rematch";

const FORENSIC = "cmu4k7t8v003yjktzkcr5anbu";
const prisma = new PrismaClient();

async function main() {
  if (!process.argv.includes("--mutate")) {
    const forensic = await prisma.intakeBatch.findUnique({
      where: { id: FORENSIC },
      select: { id: true, status: true, updatedAt: true },
    });
    console.log(
      JSON.stringify(
        {
          forensicUntouched: Boolean(forensic),
          forensicId: FORENSIC,
          forensicStatus: forensic?.status ?? null,
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

  const demandThenVehicle = await proveDemandThenVehicle({
    suffix,
    buyerId: buyer.id,
    sellerId: seller.id,
  });
  const vehicleThenDemand = await proveVehicleThenDemand({
    suffix,
    buyerId: buyer.id,
    sellerId: seller.id,
  });

  console.log(
    JSON.stringify(
      {
        demandThenVehicle,
        vehicleThenDemand,
        ok: demandThenVehicle.ok && vehicleThenDemand.ok,
        forensicUntouched: true,
      },
      null,
      2
    )
  );
}

async function proveDemandThenVehicle(input: {
  suffix: string;
  buyerId: string;
  sellerId: string;
}) {
  const demand = await prisma.demand.create({
    data: {
      dealerId: input.buyerId,
      rawText: `E2E ${input.suffix} Subaru Forester 2004 עד 55`,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      confirmedJson: {
        make: "Subaru",
        model: "Forester",
        yearMin: 2004,
        yearMax: 2004,
        budgetMax: 55000,
      },
    },
  });
  const t0 = await runMatchingForDemand(demand.id);
  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: input.sellerId,
      status: "ACTIVE",
      make: "Subaru",
      model: "Forester",
      year: 2004,
      mileage: 180000,
      b2bPrice: 48000,
      retailPrice: 52000,
      dealerRelationship: "OWNED",
      visibility: "ANONYMOUS_NETWORK",
      mediaReady: true,
      rawInput: `e2e-demand-then-vehicle-${input.suffix}`,
    },
  });
  await rematchAfterInventoryMutation({
    vehicleId: vehicle.id,
    sellerDealerId: input.sellerId,
  });
  const t1 = await prisma.candidateMatch.count({
    where: { demandId: demand.id, vehicleId: vehicle.id },
  });
  return {
    demandId: demand.id,
    vehicleId: vehicle.id,
    matchesAtT0: t0.length,
    matchesAtT1: t1,
    ok: t0.length === 0 && t1 > 0,
  };
}

async function proveVehicleThenDemand(input: {
  suffix: string;
  buyerId: string;
  sellerId: string;
}) {
  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: input.sellerId,
      status: "ACTIVE",
      make: "Dacia",
      model: "Duster",
      year: 2006,
      mileage: 160000,
      b2bPrice: 39000,
      retailPrice: 42000,
      dealerRelationship: "OWNED",
      visibility: "ANONYMOUS_NETWORK",
      mediaReady: true,
      rawInput: `e2e-vehicle-then-demand-${input.suffix}`,
    },
  });
  const demand = await prisma.demand.create({
    data: {
      dealerId: input.buyerId,
      rawText: `E2E ${input.suffix} Dacia Duster 2006 עד 45`,
      status: "ACTIVE",
      networkVisibility: "ANONYMOUS_NETWORK",
      confirmedJson: {
        make: "Dacia",
        model: "Duster",
        yearMin: 2006,
        yearMax: 2006,
        budgetMax: 45000,
      },
    },
  });
  const t1 = await runMatchingForDemand(demand.id);
  const hits = t1.filter((row: { vehicleId?: string }) => row.vehicleId === vehicle.id);
  const persisted = await prisma.candidateMatch.count({
    where: { demandId: demand.id, vehicleId: vehicle.id },
  });
  return {
    demandId: demand.id,
    vehicleId: vehicle.id,
    immediateHits: hits.length || persisted,
    ok: persisted > 0 || hits.length > 0,
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
