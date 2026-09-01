import { prisma } from "@/lib/prisma";
import { ensureDealerCommercial } from "@/services/commercial/reveal-usage";
import {
  sendDealerApprovedEmail,
  sendDealerRejectedEmail,
} from "@/services/email";
import { logAppEvent } from "@/services/notifications";
import { createNotification } from "@/services/notifications";

export async function getPendingDealers() {
  return prisma.dealer.findMany({
    where: {
      verificationStatus: "PENDING",
      memberships: {
        some: {
          user: { emailVerifiedAt: { not: null } },
        },
      },
    },
    include: {
      memberships: {
        include: { user: true },
        where: { role: "OWNER" },
        take: 1,
      },
      commercial: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDealerForReview(dealerId: string) {
  return prisma.dealer.findUnique({
    where: { id: dealerId },
    include: {
      memberships: {
        include: { user: true },
        where: { role: "OWNER" },
        take: 1,
      },
      commercial: true,
    },
  });
}

export async function approveDealer(dealerId: string, adminUserId: string) {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    include: {
      memberships: { include: { user: true }, where: { role: "OWNER" }, take: 1 },
    },
  });

  if (!dealer) {
    return { ok: false as const, error: "not_found" as const };
  }

  if (dealer.verificationStatus === "VERIFIED") {
    return { ok: true as const, already: true as const, dealer };
  }

  if (dealer.verificationStatus !== "PENDING") {
    return { ok: false as const, error: "invalid_status" as const };
  }

  const updated = await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      verificationStatus: "VERIFIED",
      rejectionReason: null,
    },
  });

  await ensureDealerCommercial(dealerId);

  const owner = dealer.memberships[0]?.user;
  if (owner) {
    await sendDealerApprovedEmail({ to: owner.email, name: owner.name });
    await createNotification({
      userId: owner.id,
      type: "DEALER_VERIFICATION",
      title: "החשבון שלך אושר",
      body: "אפשר להתחיל להשתמש ב-REMATCHER Exchange.",
      link: "/home",
      sendPush: true,
    });
  }

  await logAppEvent({
    eventType: "dealer_approved",
    entityType: "Dealer",
    entityId: dealerId,
    dealerId,
    metadata: { adminUserId },
  });

  return { ok: true as const, dealer: updated };
}

export async function rejectDealer(
  dealerId: string,
  adminUserId: string,
  reason?: string
) {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    include: {
      memberships: { include: { user: true }, where: { role: "OWNER" }, take: 1 },
    },
  });

  if (!dealer) {
    return { ok: false as const, error: "not_found" as const };
  }

  if (dealer.verificationStatus === "REJECTED") {
    return { ok: true as const, already: true as const, dealer };
  }

  const updated = await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      verificationStatus: "REJECTED",
      rejectionReason: reason?.trim() || null,
    },
  });

  const owner = dealer.memberships[0]?.user;
  if (owner) {
    await sendDealerRejectedEmail({ to: owner.email, name: owner.name });
  }

  await logAppEvent({
    eventType: "dealer_rejected",
    entityType: "Dealer",
    entityId: dealerId,
    dealerId,
    metadata: { adminUserId, reason: reason ?? null },
  });

  return { ok: true as const, dealer: updated };
}

export async function countPendingDealersForApproval() {
  return prisma.dealer.count({
    where: {
      verificationStatus: "PENDING",
      memberships: {
        some: { user: { emailVerifiedAt: { not: null } } },
      },
    },
  });
}
