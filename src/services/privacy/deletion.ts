/**
 * Real account-deletion lifecycle.
 * Inventory: docs/release/ACCOUNT_DELETION_DATA_INVENTORY.md
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { forgetAllMemoryForDealer } from "@/services/assistant/dealer-memory";
import { revokeAllMobileSessionsForUser } from "@/services/identity/mobile-session";

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

/**
 * Completes deletion only after revoke/anonymize steps succeed.
 * Does not invent legal retention — see inventory for RETAIN_FOR_EXPLICIT_LEGAL_REASON rows.
 */
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

  try {
    await forgetAllMemoryForDealer(params.dealerId);

    await revokeAllMobileSessionsForUser(params.userId);

    await prisma.deviceInstallation.deleteMany({
      where: { userId: params.userId },
    });
    await prisma.pushSubscription.deleteMany({
      where: { userId: params.userId },
    });
    await prisma.externalIdentity.deleteMany({
      where: { userId: params.userId },
    });
    await prisma.notificationPreference.deleteMany({
      where: { userId: params.userId },
    });
    await prisma.notificationEventPreference.deleteMany({
      where: { userId: params.userId },
    });
    await prisma.identityLinkChallenge.deleteMany({
      where: { userId: params.userId },
    });

    // Anonymize personal profile fields on User (retain row id for FK integrity / audit).
    const tombstoneEmail = `deleted+${params.userId}@invalid.rematcher.local`;
    await prisma.user.update({
      where: { id: params.userId },
      data: {
        email: tombstoneEmail,
        name: "Deleted User",
        phone: null,
        accountStatus: "SUSPENDED",
        emailVerifiedAt: null,
        passwordHash: null,
      },
    });

    await prisma.dealer.update({
      where: { id: params.dealerId },
      data: {
        isActive: false,
        verificationStatus: "DISABLED",
        contactName: "Deleted",
        phone: "0000000000",
        city: null,
        region: null,
      },
    });

    // MarketWatch rows cascade on dealer hard-delete only; disabled dealer keeps watches (see inventory doc).
    // ExchangeEvent / Vehicle / Demand / Reveal rows: RETAIN_FOR_EXPLICIT_LEGAL_REASON — not wiped in this pass.

    // SIWA token revocation requires Apple client secret — EXTERNAL APPLE ACTION when unavailable.
    // See docs/release/EXTERNAL_ACTIONS.md

    await prisma.accountDeletionRequest.update({
      where: { id: req.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    return { ok: true as const };
  } catch (error) {
    await prisma.accountDeletionRequest.update({
      where: { id: req.id },
      data: { status: "PENDING", confirmedAt: null },
    });
    throw error;
  }
}
