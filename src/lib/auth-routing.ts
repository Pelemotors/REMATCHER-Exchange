import { isAdminRole } from "@/lib/brand-copy";
import { sanitizeReturnPath } from "@/lib/deep-links";

export interface AuthRoutingUser {
  role?: string | null;
  dealerId?: string | null;
  emailVerifiedAt?: Date | string | null;
  verificationStatus?: string | null;
}

/** Resolve post-login destination based on user/dealer state */
export function getPostAuthRedirect(
  user: AuthRoutingUser,
  callbackUrl?: string | null
): string {
  const safe = sanitizeReturnPath(callbackUrl);
  if (safe) {
    return safe;
  }

  if (isAdminRole(user.role) && !user.dealerId) {
    return "/admin";
  }

  if (!user.emailVerifiedAt) {
    return "/verify-email";
  }

  if (user.verificationStatus === "REJECTED") {
    return "/rejected";
  }

  if (user.verificationStatus === "PENDING") {
    return "/pending-approval";
  }

  return "/home";
}

export function canAccessExchange(user: AuthRoutingUser): boolean {
  return (
    Boolean(user.emailVerifiedAt) &&
    user.verificationStatus === "VERIFIED" &&
    Boolean(user.dealerId)
  );
}
