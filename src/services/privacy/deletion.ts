/**
 * Real deletion backends for Privacy Center / account lifecycle.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { forgetAllMemoryForDealer } from "@/services/assistant/dealer-memory";

export async function deleteAllDealerMemoryForOwner(params: {
  dealerId: string;
  userId: string;
}) {
  const membership = await prisma.dealerMembership.findFirst({
    where: { dealerId: params.dealerId, userId: params.userId },
  });
  if (!membership) {
    return { ok: false as const, error: "forbidden" };
  }
  const result = await forgetAllMemoryForDealer(params.dealerId);
  return { ok: true as const, ...result };
}

export async function requestAccountDeletion(params: {
  userId: string;
  dealerId: string;
  note?: string;
}) {
  const membership = await prisma.dealerMembership.findFirst({
    where: {
      userId: params.userId,
      dealerId: params.dealerId,
      role: "OWNER",
    },
  });
  if (!membership) {
    return {
      ok: false as const,
      error: "only_owner",
      message: "רק בעל החשבון יכול לבקש מחיקת חשבון.",
    };
  }

  const row = await prisma.accountDeletionRequest.create({
    data: {
      userId: params.userId,
      dealerId: params.dealerId,
      status: "PENDING",
      note: params.note ?? null,
    },
  });
  return { ok: true as const, request: row };
}

export async function confirmAccountDeletion(params: {
  userId: string;
  dealerId: string;
  requestId: string;
}) {
  const membership = await prisma.dealerMembership.findFirst({
    where: {
      userId: params.userId,
      dealerId: params.dealerId,
      role: "OWNER",
    },
  });
  if (!membership) {
    return { ok: false as const, error: "only_owner" };
  }

  const req = await prisma.accountDeletionRequest.findFirst({
    where: {
      id: params.requestId,
      userId: params.userId,
      dealerId: params.dealerId,
      status: "PENDING",
    },
  });
  if (!req) return { ok: false as const, error: "not_found" };

  await prisma.accountDeletionRequest.update({
    where: { id: req.id },
    data: { status: "PROCESSING", confirmedAt: new Date() },
  });

  await forgetAllMemoryForDealer(params.dealerId);
  await prisma.pushSubscription.deleteMany({
    where: { user: { memberships: { some: { dealerId: params.dealerId } } } },
  });
  await prisma.dealer.update({
    where: { id: params.dealerId },
    data: { isActive: false, verificationStatus: "DISABLED" },
  });

  await prisma.accountDeletionRequest.update({
    where: { id: req.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return { ok: true as const };
}
