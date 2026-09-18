import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { mePayload } from "@/lib/api-v1/me-payload";
import { hasCompletedPrivacyAiV1 } from "@/services/privacy/policy";
import { verifyAppleIdToken } from "@/services/identity/apple-provider";
import { verifyGoogleIdToken } from "@/services/identity/google-provider";
import {
  findOrCreateFromProvider,
  IdentityLinkError,
} from "@/services/identity/account-linking";
import {
  issueMobileSession,
  loadPrincipalForUserId,
} from "@/services/identity/mobile-session";

export const dynamic = "force-dynamic";

const schema = z.object({
  provider: z.enum(["apple", "google"]),
  idToken: z.string().min(10).max(8000),
  nonce: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  installationId: z.string().min(3).max(120).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

/**
 * Native Social Login → existing REMATCHER User/Dealer → mobile session.
 * Client is never authority for userId/dealerId.
 */
export async function POST(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  void getClientIp(req);

  try {
    const provider = parsed.data.provider === "apple" ? "APPLE" : "GOOGLE";
    const verified =
      provider === "APPLE"
        ? await verifyAppleIdToken(parsed.data.idToken, {
            nonce: parsed.data.nonce,
          })
        : await verifyGoogleIdToken(parsed.data.idToken);

    const result = await findOrCreateFromProvider({
      provider,
      subject: verified.subject,
      verifiedEmail: verified.email,
      emailVerified: verified.emailVerified,
      displayName:
        provider === "APPLE"
          ? parsed.data.name ?? null
          : "name" in verified
            ? verified.name
            : null,
      rawProfile: verified.raw,
    });

    const principalResult = await loadPrincipalForUserId(result.user.id);
    if (!principalResult.ok) {
      return v1Error(ctx, principalResult.code);
    }

    const session = await issueMobileSession({
      userId: result.user.id,
      installationId: parsed.data.installationId,
      platform: parsed.data.platform ?? "ios",
    });
    const privacyAiComplete = await hasCompletedPrivacyAiV1({
      userId: principalResult.principal.userId,
      dealerId: principalResult.principal.dealerId,
    });

    return v1Json(ctx, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      tokenType: "Bearer",
      created: result.created,
      needsDealerProfile: result.needsDealerProfile,
      me: mePayload(principalResult.principal, { privacyAiComplete }),
    });
  } catch (err) {
    if (err instanceof IdentityLinkError) {
      if (err.code === "TAKEOVER_REJECTED") {
        return v1Error(ctx, "IDENTITY_LINK_REQUIRED", err.message);
      }
      if (err.code === "PROVIDER_TAKEN") {
        return v1Error(ctx, "IDENTITY_PROVIDER_TAKEN", err.message);
      }
      return v1Error(ctx, "RESOURCE_CONFLICT", err.message);
    }
    const message = err instanceof Error ? err.message : "Social auth failed";
    if (/not configured|audience|issuer|expired|jwt|token/i.test(message)) {
      return v1Error(ctx, "AUTH_UNAUTHENTICATED", message);
    }
    return v1Error(ctx, "AUTH_UNAUTHENTICATED");
  }
}
