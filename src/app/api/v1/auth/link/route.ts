import { z } from "zod";
import { getClientIp } from "@/lib/client-ip";
import { resolveV1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error, v1Json } from "@/lib/api-v1/respond";
import { mePayload } from "@/lib/api-v1/me-payload";
import { hasCompletedPrivacyAiV1 } from "@/services/privacy/policy";
import { verifyAppleIdToken } from "@/services/identity/apple-provider";
import { verifyGoogleIdToken } from "@/services/identity/google-provider";
import {
  linkProviderToUser,
  IdentityLinkError,
} from "@/services/identity/account-linking";
import {
  authenticateMobilePassword,
  issueMobileSession,
  loadPrincipalForUserId,
} from "@/services/identity/mobile-session";

export const dynamic = "force-dynamic";

/**
 * Explicit link: password re-auth of existing REMATCHER user + verified provider token.
 * Never merges on client-supplied email alone.
 */
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  provider: z.enum(["apple", "google"]),
  idToken: z.string().min(10).max(8000),
  nonce: z.string().max(200).optional(),
  installationId: z.string().min(3).max(120).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

export async function POST(req: Request) {
  const ctx = resolveV1RequestContext(req);
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return v1Error(ctx, "VALIDATION_INVALID_REQUEST");
  }

  const auth = await authenticateMobilePassword({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: getClientIp(req),
  });
  if (!auth.ok) return v1Error(ctx, auth.code);

  try {
    const provider = parsed.data.provider === "apple" ? "APPLE" : "GOOGLE";
    const verified =
      provider === "APPLE"
        ? await verifyAppleIdToken(parsed.data.idToken, {
            nonce: parsed.data.nonce,
          })
        : await verifyGoogleIdToken(parsed.data.idToken);

    // If provider email is present and verified, it must match the authenticated account
    // (or be Private Relay / null) — never link across accounts by unverified assertion.
    if (
      verified.email &&
      verified.emailVerified &&
      verified.email !== auth.principal.email.toLowerCase() &&
      !verified.email.endsWith("@privaterelay.appleid.com")
    ) {
      return v1Error(
        ctx,
        "IDENTITY_LINK_REQUIRED",
        "אימייל הספק אינו תואם לחשבון המחובר."
      );
    }

    await linkProviderToUser(auth.principal.userId, {
      provider,
      subject: verified.subject,
      verifiedEmail: verified.email,
      emailVerified: verified.emailVerified,
      rawProfile: verified.raw,
    });

    const principalResult = await loadPrincipalForUserId(auth.principal.userId);
    if (!principalResult.ok) return v1Error(ctx, principalResult.code);

    const session = await issueMobileSession({
      userId: auth.principal.userId,
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
      linked: true,
      me: mePayload(principalResult.principal, { privacyAiComplete }),
    });
  } catch (err) {
    if (err instanceof IdentityLinkError) {
      if (err.code === "PROVIDER_TAKEN") {
        return v1Error(ctx, "IDENTITY_PROVIDER_TAKEN", err.message);
      }
      return v1Error(ctx, "RESOURCE_CONFLICT", err.message);
    }
    return v1Error(ctx, "AUTH_UNAUTHENTICATED");
  }
}
