import "server-only";
import type { IdentityProvider, User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAppEvent } from "@/services/events/log-event";
import { getDealerEntitlement } from "@/services/entitlements";
import { ensureDealerCommercial } from "@/services/commercial/reveal-usage";
import { isMonetizationEnabled, isTrialEnabled } from "@/services/product-policy";
import { startTrial } from "@/services/entitlements";

function asJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

export class IdentityLinkError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "TAKEOVER_REJECTED"
      | "ALREADY_LINKED"
      | "PROVIDER_TAKEN"
      | "NOT_FOUND"
  ) {
    super(message);
    this.name = "IdentityLinkError";
  }
}

export type ProviderIdentityInput = {
  provider: IdentityProvider;
  subject: string;
  verifiedEmail: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  rawProfile?: Record<string, unknown>;
};

async function ensureMinimalDealerForUser(user: User): Promise<{
  dealerId: string;
  needsDealerProfile: boolean;
}> {
  const membership = await prisma.dealerMembership.findFirst({
    where: { userId: user.id },
    include: { dealer: true },
  });
  if (membership) {
    await getDealerEntitlement(membership.dealerId);
    const needsDealerProfile =
      membership.dealer.businessName.startsWith("Dealer ") ||
      membership.dealer.phone === "0000000000";
    return { dealerId: membership.dealerId, needsDealerProfile };
  }

  const stubName =
    user.name?.trim() ||
    (user.email.includes("@") ? user.email.split("@")[0]! : "Dealer");

  const dealer = await prisma.dealer.create({
    data: {
      businessName: `Dealer ${stubName}`,
      contactName: stubName,
      phone: "0000000000",
      email: user.email,
      verificationStatus: "PENDING",
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  await ensureDealerCommercial(dealer.id);
  await getDealerEntitlement(dealer.id);

  if ((await isMonetizationEnabled()) && (await isTrialEnabled())) {
    try {
      await startTrial(dealer.id);
    } catch {
      // eligible/already — ignore
    }
  }

  await logAppEvent({
    eventType: "ACCOUNT_CREATED",
    entityType: "User",
    entityId: user.id,
    dealerId: dealer.id,
    userId: user.id,
    metadata: { via: "oauth", providerStub: true },
  });

  return { dealerId: dealer.id, needsDealerProfile: true };
}

/**
 * Link a verified provider subject to an authenticated user.
 * Rejects takeover: email match alone is insufficient; subject must be unique.
 */
export async function linkProviderToUser(
  userId: string,
  identity: ProviderIdentityInput
) {
  const existing = await prisma.externalIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: identity.provider,
        providerSubject: identity.subject,
      },
    },
  });

  if (existing && existing.userId !== userId) {
    throw new IdentityLinkError(
      "Provider subject already linked to another account",
      "PROVIDER_TAKEN"
    );
  }
  if (existing && existing.userId === userId) {
    await prisma.externalIdentity.update({
      where: { id: existing.id },
      data: {
        lastUsedAt: new Date(),
        verifiedEmail: identity.verifiedEmail,
        rawProfileJson: asJson(identity.rawProfile),
      },
    });
    return existing;
  }

  // Email alone must NOT auto-link to a different account (takeover rejection)
  if (identity.verifiedEmail) {
    const emailOwner = await prisma.user.findUnique({
      where: { email: identity.verifiedEmail.toLowerCase() },
    });
    if (emailOwner && emailOwner.id !== userId) {
      throw new IdentityLinkError(
        "Email belongs to another account; explicit link required after auth",
        "TAKEOVER_REJECTED"
      );
    }
  }

  const linked = await prisma.externalIdentity.create({
    data: {
      userId,
      provider: identity.provider,
      providerSubject: identity.subject,
      verifiedEmail: identity.verifiedEmail,
      rawProfileJson: asJson(identity.rawProfile),
    },
  });

  await logAppEvent({
    eventType: "IDENTITY_LINKED",
    entityType: "User",
    entityId: userId,
    userId,
    metadata: { provider: identity.provider },
  });

  return linked;
}

export async function findOrCreateFromProvider(
  identity: ProviderIdentityInput
): Promise<{
  user: User;
  dealerId: string;
  needsDealerProfile: boolean;
  created: boolean;
}> {
  const existingIdentity = await prisma.externalIdentity.findUnique({
    where: {
      provider_providerSubject: {
        provider: identity.provider,
        providerSubject: identity.subject,
      },
    },
    include: { user: true },
  });

  if (existingIdentity) {
    await prisma.externalIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        lastUsedAt: new Date(),
        verifiedEmail: identity.verifiedEmail ?? existingIdentity.verifiedEmail,
        rawProfileJson: asJson(identity.rawProfile),
      },
    });
    const dealer = await ensureMinimalDealerForUser(existingIdentity.user);
    return {
      user: existingIdentity.user,
      dealerId: dealer.dealerId,
      needsDealerProfile: dealer.needsDealerProfile,
      created: false,
    };
  }

  // Do NOT create-by-email alone (takeover). New provider subject → new user
  // unless an authenticated link flow is used.
  if (identity.verifiedEmail) {
    const emailUser = await prisma.user.findUnique({
      where: { email: identity.verifiedEmail.toLowerCase() },
      include: { externalIdentities: true },
    });
    if (emailUser) {
      // Returning email user without this provider: reject silent takeover
      throw new IdentityLinkError(
        "Account with this email exists; sign in and link provider",
        "TAKEOVER_REJECTED"
      );
    }
  }

  const email =
    identity.verifiedEmail?.toLowerCase() ??
    `${identity.provider.toLowerCase()}_${identity.subject}@oauth.rematcher.local`;

  const name =
    identity.displayName?.trim() ||
    (identity.verifiedEmail
      ? identity.verifiedEmail.split("@")[0]!
      : `${identity.provider} User`);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      name,
      emailVerifiedAt: identity.verifiedEmail ? new Date() : null,
      role: "DEALER_USER",
      externalIdentities: {
        create: {
          provider: identity.provider,
          providerSubject: identity.subject,
          verifiedEmail: identity.verifiedEmail,
          rawProfileJson: asJson(identity.rawProfile),
        },
      },
    },
  });

  const dealer = await ensureMinimalDealerForUser(user);

  await logAppEvent({
    eventType: "IDENTITY_LINKED",
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    dealerId: dealer.dealerId,
    metadata: { provider: identity.provider, created: true },
  });

  return {
    user,
    dealerId: dealer.dealerId,
    needsDealerProfile: dealer.needsDealerProfile,
    created: true,
  };
}
