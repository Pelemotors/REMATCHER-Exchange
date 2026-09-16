import "server-only";
import { prisma } from "@/lib/prisma";

export async function refreshBatchStatus(batchId: string) {
  const openReview = await prisma.vehicleCandidate.count({
    where: {
      batchId,
      status: { in: ["NEEDS_INFO", "NEEDS_CONFIRMATION"] },
    },
  });
  const failed = await prisma.vehicleCandidate.count({
    where: { batchId, status: "REJECTED" },
  });
  const committed = await prisma.vehicleCandidate.count({
    where: { batchId, status: "COMMITTED" },
  });
  const total = await prisma.vehicleCandidate.count({ where: { batchId } });

  let batchStatus: "NEEDS_REVIEW" | "READY" | "COMMITTED" | "PROCESSING" =
    "PROCESSING";
  if (openReview > 0) batchStatus = "NEEDS_REVIEW";
  else if (total > 0 && committed === total) batchStatus = "COMMITTED";
  else if (total > 0 && openReview === 0 && failed === 0) batchStatus = "READY";
  else if (committed > 0) batchStatus = "READY";

  await prisma.intakeBatch.update({
    where: { id: batchId },
    data: {
      status: batchStatus,
      processingCompletedAt: new Date(),
    },
  });
}

export function normalizePlate(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}
