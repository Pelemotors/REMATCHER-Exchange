import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/brand-copy";
import {
  assertEntitled,
  ensureEntitlementOnDealerAccess,
  EntitlementError,
} from "@/services/entitlements";
import { isMonetizationEnabled } from "@/services/product-policy";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" as const, status: 401 as const };
  }
  return { session };
}

export async function requireDealerSession() {
  const result = await requireSession();
  if ("error" in result) return result;
  if (!result.session.user.dealerId) {
    return { error: "Unauthorized" as const, status: 401 as const };
  }
  await ensureEntitlementOnDealerAccess(result.session.user.dealerId);
  return { session: result.session };
}

/**
 * When monetization is OFF this is a no-op (always allows).
 * When ON, requires ACTIVE / TRIAL / FOUNDING_DEALER / GRACE_PERIOD.
 */
export async function requireEntitledDealer(capability?: string) {
  const result = await requireDealerSession();
  if ("error" in result) return result;

  if (!(await isMonetizationEnabled())) {
    return { session: result.session };
  }

  try {
    await assertEntitled(result.session.user.dealerId!, capability);
    return { session: result.session };
  } catch (err) {
    if (err instanceof EntitlementError) {
      return {
        error: "Subscription required" as const,
        status: 402 as const,
        code: err.code,
      };
    }
    throw err;
  }
}

export async function requireVerifiedDealer() {
  const result = await requireDealerSession();
  if ("error" in result) return result;

  const { session } = result;
  const dealerId = session.user.dealerId!;

  const membership = await prisma.dealerMembership.findUnique({
    where: {
      userId_dealerId: {
        userId: session.user.id,
        dealerId,
      },
    },
    select: {
      user: { select: { emailVerifiedAt: true } },
      dealer: { select: { verificationStatus: true, isActive: true } },
    },
  });

  if (!membership?.user.emailVerifiedAt) {
    return { error: "Email not verified" as const, status: 403 as const };
  }
  if (
    membership.dealer.verificationStatus !== "VERIFIED" ||
    !membership.dealer.isActive
  ) {
    return { error: "Dealer not verified" as const, status: 403 as const };
  }
  return { session };
}

export async function requireAdminSession() {
  const result = await requireSession();
  if ("error" in result) return result;
  if (!isAdminRole(result.session.user.role)) {
    return { error: "Forbidden" as const, status: 403 as const };
  }
  return { session: result.session };
}
