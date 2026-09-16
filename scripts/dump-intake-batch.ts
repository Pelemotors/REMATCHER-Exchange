/**
 * Dump per-media discovery for a fresh intake batch.
 * Never mutates forensic batch cmu4k7t8v003yjktzkcr5anbu.
 *
 *   node -r ./scripts/register-server-only.cjs --import tsx scripts/dump-intake-batch.ts [batchId]
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FORENSIC = "cmu4k7t8v003yjktzkcr5anbu";
const prisma = new PrismaClient();

async function main() {
  const requested = process.argv[2];
  if (requested === FORENSIC) throw new Error("refusing forensic batch");

  const forensic = await prisma.intakeBatch.findUnique({
    where: { id: FORENSIC },
    select: { id: true, status: true, updatedAt: true },
  });

  const batch =
    (requested
      ? await prisma.intakeBatch.findUnique({ where: { id: requested } })
      : await prisma.intakeBatch.findFirst({
          where: { id: { not: FORENSIC } },
          orderBy: { createdAt: "desc" },
        })) ?? null;
  if (!batch) throw new Error("no fresh batch");
  if (batch.id === FORENSIC) throw new Error("refusing forensic batch");

  const media = await prisma.intakeMedia.findMany({
    where: { batchId: batch.id },
    orderBy: { originalOrder: "asc" },
    include: { candidates: { select: { candidateId: true, sortOrder: true } } },
  });
  const candidates = await prisma.vehicleCandidate.findMany({
    where: { batchId: batch.id },
    orderBy: { createdAt: "asc" },
    include: {
      media: { select: { mediaId: true, sortOrder: true } },
      existingVehicle: {
        select: {
          id: true,
          dealerRelationship: true,
          visibility: true,
          status: true,
        },
      },
    },
  });
  const committedIds = candidates
    .map((c) => c.committedVehicleId)
    .filter((id): id is string => Boolean(id));
  const vehicles = committedIds.length
    ? await prisma.vehicle.findMany({
        where: { id: { in: committedIds } },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          dealerRelationship: true,
          visibility: true,
          status: true,
          mediaReady: true,
          media: { select: { id: true } },
          catalogPublications: { select: { id: true, isActive: true } },
        },
      })
    : [];

  const day = new Date().toISOString().slice(0, 10);
  const outDir = join(process.cwd(), "docs/visual-evidence/pixel-faithful", day);
  mkdirSync(outDir, { recursive: true });
  const report = {
    forensic: {
      id: forensic?.id ?? null,
      status: forensic?.status ?? null,
      updatedAt: forensic?.updatedAt ?? null,
      untouched: forensic?.id === FORENSIC,
    },
    batch: { id: batch.id, status: batch.status, createdAt: batch.createdAt },
    submittedMedia: media.length,
    persistedMedia: media.length,
    perMedia: media.map((m) => {
      const d = (m.discoveryJson ?? {}) as Record<string, unknown>;
      return {
        id: m.id,
        originalOrder: m.originalOrder,
        processingStatus: m.processingStatus,
        categoryHint: m.categoryHint,
        ocrAttempted: d.ocrAttempted ?? d.ocr ?? d.plate ?? null,
        plateFound: d.plateNormalized ?? d.detectedPlate ?? null,
        grouping: d.groupKey ?? d.candidateId ?? null,
        discoveryJson: m.discoveryJson,
        attachedCandidateIds: m.candidates.map((x) => x.candidateId),
      };
    }),
    candidates: candidates.map((c) => ({
      id: c.id,
      status: c.status,
      plateNormalized: c.plateNormalized,
      govState: c.govState,
      govIdentityJson: c.govIdentityJson,
      dealerIntent: c.dealerIntent,
      committedVehicleId: c.committedVehicleId,
      failureCode: c.failureCode,
      failureMessage: c.failureMessage,
      mediaCount: c.media.length,
    })),
    vehicles,
    unresolvedMedia: media.filter((m) => m.candidates.length === 0).map((m) => m.id),
  };
  writeFileSync(join(outDir, "batch16-db.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, batchId: batch.id, out: join(outDir, "batch16-db.json") }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
