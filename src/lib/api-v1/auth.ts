import { resolveV1RequestContext, type V1RequestContext } from "@/lib/api-v1/request-context";
import { v1Error } from "@/lib/api-v1/respond";
import {
  resolveMobileAccess,
  type MobilePrincipal,
} from "@/services/identity/mobile-session";
import type { NextResponse } from "next/server";

export type V1DealerAuth = {
  ctx: V1RequestContext;
  principal: MobilePrincipal;
};

export type V1AuthResult =
  | { ok: true; auth: V1DealerAuth }
  | { ok: false; response: NextResponse };

function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

/**
 * Mobile /api/v1 identity. dealerId always comes from the live DB membership,
 * never from the request body.
 */
export async function requireV1Dealer(req: Request): Promise<V1AuthResult> {
  const ctx = resolveV1RequestContext(req);
  const token = bearerFrom(req);
  if (!token) {
    return { ok: false, response: v1Error(ctx, "AUTH_UNAUTHENTICATED") };
  }
  const resolved = await resolveMobileAccess(token);
  if (!resolved.ok) {
    return { ok: false, response: v1Error(ctx, resolved.code) };
  }
  return { ok: true, auth: { ctx, principal: resolved.principal } };
}

/** Inventory / matches / interest — same gates as Web requireVerifiedDealer. */
export async function requireV1VerifiedDealer(req: Request): Promise<V1AuthResult> {
  const result = await requireV1Dealer(req);
  if (!result.ok) return result;
  const { principal, ctx } = result.auth;
  if (!principal.emailVerifiedAt) {
    return { ok: false, response: v1Error(ctx, "PERMISSION_EMAIL_UNVERIFIED") };
  }
  if (principal.verificationStatus !== "VERIFIED" || !principal.dealerActive) {
    return { ok: false, response: v1Error(ctx, "PERMISSION_DEALER_UNVERIFIED") };
  }
  return result;
}
