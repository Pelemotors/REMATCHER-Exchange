import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/brand-copy";

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
  return { session: result.session };
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
