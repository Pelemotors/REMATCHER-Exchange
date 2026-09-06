import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ensureDealerCommercial } from "@/services/commercial/reveal-usage";
import { logAppEvent } from "@/services/notifications";

const MIN_PASSWORD_LENGTH = 8;

export async function createDealerByAdmin(input: {
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  password: string;
  city?: string | null;
  activateNow?: boolean;
  adminUserId: string;
}) {
  const businessName = input.businessName.trim();
  const contactName = input.contactName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();
  const city = input.city?.trim() || null;

  if (!businessName || !contactName || !phone || !email) {
    return { ok: false as const, error: "missing_fields" as const };
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: "password_too_short" as const };
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { ok: false as const, error: "email_exists" as const };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const activateNow = Boolean(input.activateNow);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: contactName,
        phone,
        emailVerifiedAt: activateNow ? new Date() : null,
      },
    });

    const dealer = await tx.dealer.create({
      data: {
        businessName,
        contactName,
        phone,
        email,
        city,
        verificationStatus: activateNow ? "VERIFIED" : "PENDING",
        isActive: activateNow,
        cohort: activateNow ? "PILOT" : null,
      },
    });

    await tx.dealerMembership.create({
      data: { userId: user.id, dealerId: dealer.id, role: "OWNER" },
    });

    return { user, dealer };
  });

  if (activateNow) {
    await ensureDealerCommercial(created.dealer.id);
  }

  await logAppEvent({
    eventType: "dealer_created_by_admin",
    entityType: "Dealer",
    entityId: created.dealer.id,
    dealerId: created.dealer.id,
    metadata: { adminUserId: input.adminUserId, activateNow },
  });

  return { ok: true as const, dealerId: created.dealer.id, userId: created.user.id };
}

export async function setDealerFrozen(input: {
  dealerId: string;
  frozen: boolean;
  adminUserId: string;
}) {
  const dealer = await prisma.dealer.findUnique({
    where: { id: input.dealerId },
    select: { id: true, verificationStatus: true },
  });
  if (!dealer) return { ok: false as const, error: "not_found" as const };

  if (input.frozen && dealer.verificationStatus !== "VERIFIED") {
    return { ok: false as const, error: "invalid_status" as const };
  }
  if (!input.frozen && dealer.verificationStatus !== "DISABLED") {
    return { ok: false as const, error: "invalid_status" as const };
  }

  await prisma.dealer.update({
    where: { id: input.dealerId },
    data: input.frozen
      ? { verificationStatus: "DISABLED", isActive: false }
      : { verificationStatus: "VERIFIED", isActive: true },
  });

  await logAppEvent({
    eventType: input.frozen ? "dealer_frozen_by_admin" : "dealer_reactivated_by_admin",
    entityType: "Dealer",
    entityId: input.dealerId,
    dealerId: input.dealerId,
    metadata: { adminUserId: input.adminUserId },
  });

  return { ok: true as const };
}

export async function verifyDealerOwnerEmail(input: {
  dealerId: string;
  adminUserId: string;
}) {
  const membership = await prisma.dealerMembership.findFirst({
    where: { dealerId: input.dealerId, role: "OWNER" },
    include: { user: true },
  });
  if (!membership) return { ok: false as const, error: "owner_not_found" as const };

  if (!membership.user.emailVerifiedAt) {
    await prisma.user.update({
      where: { id: membership.userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  await logAppEvent({
    eventType: "email_verified_by_admin",
    entityType: "User",
    entityId: membership.userId,
    dealerId: input.dealerId,
    metadata: { adminUserId: input.adminUserId },
  });

  return { ok: true as const };
}

export async function resetDealerOwnerPassword(input: {
  dealerId: string;
  password: string;
  adminUserId: string;
}) {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: "password_too_short" as const };
  }

  const membership = await prisma.dealerMembership.findFirst({
    where: { dealerId: input.dealerId, role: "OWNER" },
    select: { userId: true },
  });
  if (!membership) return { ok: false as const, error: "owner_not_found" as const };

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.update({
    where: { id: membership.userId },
    data: { passwordHash },
  });

  await prisma.session.deleteMany({ where: { userId: membership.userId } });

  await logAppEvent({
    eventType: "password_reset_by_admin",
    entityType: "User",
    entityId: membership.userId,
    dealerId: input.dealerId,
    metadata: { adminUserId: input.adminUserId },
  });

  return { ok: true as const };
}
