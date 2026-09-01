import { auth } from "@/lib/auth";
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
  if (!session.user.emailVerifiedAt) {
    return { error: "Email not verified" as const, status: 403 as const };
  }
  if (session.user.verificationStatus !== "VERIFIED") {
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
