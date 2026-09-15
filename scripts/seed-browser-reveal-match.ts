/**
 * Seed a buyer-visible CandidateMatch for Interest→Reveal browser E2E (Field Test only).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

const stub = "/tmp/ft-server-only-stub";
mkdirSync(stub, { recursive: true });
writeFileSync(join(stub, "index.js"), "module.exports = {};\n");
writeFileSync(
  join(stub, "package.json"),
  JSON.stringify({ name: "server-only", main: "index.js" })
);
const orig = (Module as unknown as { _resolveFilename: Function })._resolveFilename;
(Module as unknown as { _resolveFilename: Function })._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown
) {
  if (request === "server-only") return join(stub, "index.js");
  return orig.call(this, request, parent, isMain, options);
};

async function main() {
  const db = process.env.DATABASE_URL || "";
  if (!db.includes("5435") && !db.includes("field_test")) {
    throw new Error("Field Test DB only");
  }
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: "galsamama@gmail.com" },
      include: { memberships: true },
    });
    const dealerA = owner.memberships[0].dealerId;
    const dealerB = (
      await prisma.dealer.findFirstOrThrow({
        where: { email: "fieldtest-b@rematcher.local" },
      })
    ).id;
    const userB = await prisma.user.findFirstOrThrow({
      where: { email: "fieldtest-b@rematcher.local" },
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        dealerId: dealerB,
        status: "ACTIVE",
        make: "טויוטה",
        model: "קורולה",
        year: 2019,
        mileage: 80000,
        b2bPrice: 75000,
        retailPrice: 75000,
        mediaReady: true,
        freshnessState: "FRESH",
        rawInput: `browser-reveal-seed-${Date.now()}`,
      },
    });
    await prisma.vehicleMedia.createMany({
      data: [
        {
          vehicleId: vehicle.id,
          category: "EXTERIOR",
          storageKey: `ft-rc/${vehicle.id}/e.webp`,
          mimeType: "image/webp",
          isPrimary: true,
          sortOrder: 0,
        },
        {
          vehicleId: vehicle.id,
          category: "INTERIOR",
          storageKey: `ft-rc/${vehicle.id}/i.webp`,
          mimeType: "image/webp",
          isPrimary: false,
          sortOrder: 1,
        },
      ],
    });

    const demand = await prisma.demand.create({
      data: {
        dealerId: dealerA,
        status: "ACTIVE",
        rawText: "מחפש טויוטה קורולה 2018-2020",
        confirmedJson: {
          make: "טויוטה",
          model: "קורולה",
          yearMin: 2018,
          yearMax: 2020,
          maxPrice: 90000,
        },
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + 864e5 * 7),
      },
    });

    const { runMatchingForDemand } = await import(
      "../src/services/domain/matching-flow"
    );
    await runMatchingForDemand(demand.id);

    let match = await prisma.candidateMatch.findFirst({
      where: { demandId: demand.id, vehicleId: vehicle.id },
    });
    if (!match) {
      // Force a visible match if engine filtered (e.g. make normalize)
      match = await prisma.candidateMatch.create({
        data: {
          demandId: demand.id,
          vehicleId: vehicle.id,
          status: "VALIDATED",
          scoreBand: "GOOD",
          resolutionState: "RESOLVED",
          hardPassed: true,
          score: 0.8,
        },
      });
    } else {
      match = await prisma.candidateMatch.update({
        where: { id: match.id },
        data: {
          status: "VALIDATED",
          scoreBand: "GOOD",
          resolutionState: "RESOLVED",
          hardPassed: true,
        },
      });
    }

    console.log(
      JSON.stringify({
        demandId: demand.id,
        vehicleId: vehicle.id,
        matchId: match.id,
        dealerA,
        dealerB,
        userBId: userB.id,
        ownerUserId: owner.id,
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
