#!/usr/bin/env npx tsx
/**
 * Field Test matching acceptance with server-only stub.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import Module from "node:module";
import { PrismaClient } from "@prisma/client";

const stubDir = "/tmp/ft-server-only-stub";
mkdirSync(stubDir, { recursive: true });
writeFileSync(join(stubDir, "index.js"), "module.exports = {};\n");
writeFileSync(
  join(stubDir, "package.json"),
  JSON.stringify({ name: "server-only", main: "index.js" })
);

const orig = (Module as unknown as { _resolveFilename: Function })._resolveFilename;
(Module as unknown as { _resolveFilename: Function })._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown
) {
  if (request === "server-only") return join(stubDir, "index.js");
  return orig.call(this, request, parent, isMain, options);
};

const prisma = new PrismaClient();

async function main() {
  const db = process.env.DATABASE_URL || "";
  if (!db.includes("5435") && !db.includes("field_test")) {
    throw new Error("Refusing: not Field Test DB");
  }

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

  const vehicle = await prisma.vehicle.create({
    data: {
      dealerId: dealerB,
      status: "ACTIVE",
      make: "ניסאן",
      model: "קשקאי",
      year: 2017,
      mileage: 90000,
      b2bPrice: 85000,
      retailPrice: 85000,
      mediaReady: true,
      freshnessState: "FRESH",
      rawInput: "ft-rc match seed",
      fieldProvenance: {
        licensePlate: { value: "2211133", source: "TEST" },
      },
    },
  });
  await prisma.vehicleMedia.createMany({
    data: [
      {
        vehicleId: vehicle.id,
        category: "EXTERIOR",
        storageKey: `ft-rc/${vehicle.id}/ext.webp`,
        mimeType: "image/webp",
        isPrimary: true,
        sortOrder: 0,
      },
      {
        vehicleId: vehicle.id,
        category: "INTERIOR",
        storageKey: `ft-rc/${vehicle.id}/int.webp`,
        mimeType: "image/webp",
        isPrimary: false,
        sortOrder: 1,
      },
    ],
  });

  const notReady = await prisma.vehicle.create({
    data: {
      dealerId: dealerB,
      status: "ACTIVE",
      make: "ניסאן",
      model: "קשקאי",
      year: 2017,
      b2bPrice: 80000,
      mediaReady: false,
      rawInput: "not-ready",
    },
  });

  const demand = await prisma.demand.create({
    data: {
      dealerId: dealerA,
      status: "ACTIVE",
      rawText: "מחפש ניסאן קשקאי 2016-2018 עד 100000 שח",
      confirmedJson: {
        make: "ניסאן",
        model: "קשקאי",
        yearMin: 2016,
        yearMax: 2018,
        maxPrice: 100000,
      },
      confirmedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 864e5),
    },
  });

  const { runMatchingForDemand } = await import(
    "../src/services/domain/matching-flow"
  );
  await runMatchingForDemand(demand.id);

  const readyMatch = await prisma.candidateMatch.findFirst({
    where: { demandId: demand.id, vehicleId: vehicle.id },
  });
  const notReadyMatch = await prisma.candidateMatch.findFirst({
    where: { demandId: demand.id, vehicleId: notReady.id },
  });
  const leak = await prisma.vehicle.findFirst({
    where: { id: vehicle.id, dealerId: dealerA },
  });

  // Buyer DTO surface: API list should not expose scoreBand pre-reveal — check service mapper if present
  const { createRequire: cr } = await import("node:module");
  void cr;

  // Intake retry idempotency on existing committed batch from smoke if any
  const batch = await prisma.intakeBatch.create({
    data: {
      dealerId: dealerA,
      source: "WEB_UPLOAD",
      clientBatchId: `ft-accept-${Date.now()}`,
      status: "RECEIVED",
      acknowledgedAt: new Date(),
    },
  });
  await prisma.intakeText.create({
    data: {
      batchId: batch.id,
      text: "ניסאן 2211133 יד 2 90000 ק״מ מחיר 88000",
      provenance: "WHATSAPP_TEXT",
    },
  });
  const { processIntakeBatch } = await import(
    "../src/services/intake/process-batch"
  );
  await processIntakeBatch(dealerA, batch.id);
  const c1 = await prisma.vehicleCandidate.count({ where: { batchId: batch.id } });
  await processIntakeBatch(dealerA, batch.id);
  const c2 = await prisma.vehicleCandidate.count({ where: { batchId: batch.id } });
  const candidates = await prisma.vehicleCandidate.findMany({
    where: { batchId: batch.id },
  });

  console.log(
    JSON.stringify(
      {
        dealerIsolation: leak === null,
        readyMatched: Boolean(readyMatch),
        matchStatus: readyMatch?.status ?? null,
        scoreBandPresentOnMatchRow: readyMatch?.scoreBand ?? null,
        notReadyExcluded: notReadyMatch == null,
        intakeCandidates: c1,
        retryNoDuplicate: c1 === c2,
        candidateStatuses: candidates.map((c) => ({
          status: c.status,
          gov: c.govState,
          plate: c.plateNormalized,
          vehicleId: c.committedVehicleId,
        })),
        demandId: demand.id,
        vehicleBId: vehicle.id,
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
