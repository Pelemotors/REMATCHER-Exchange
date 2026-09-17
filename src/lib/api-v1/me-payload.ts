import type { MobilePrincipal } from "@/services/identity/mobile-session";

export function mePayload(
  principal: MobilePrincipal,
  extra?: { privacyAiComplete?: boolean }
) {
  return {
    user: {
      id: principal.userId,
      email: principal.email,
      name: principal.name,
    },
    dealer: {
      id: principal.dealerId,
      businessName: principal.dealerName,
      verificationStatus: principal.verificationStatus,
      isActive: principal.dealerActive,
    },
    gates: {
      emailVerified: Boolean(principal.emailVerifiedAt),
      dealerVerified: principal.verificationStatus === "VERIFIED",
      privacyAiComplete: extra?.privacyAiComplete ?? false,
    },
  };
}
