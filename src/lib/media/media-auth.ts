/**
 * Dual-auth media principal: Web NextAuth cookie OR Mobile Bearer.
 * dealerId always comes from server-authoritative session/principal — never from the client.
 */
import "server-only";
import { auth } from "@/lib/auth";
import { resolveMobileAccess } from "@/services/identity/mobile-session";
import type { V1ErrorCode } from "@/lib/api-v1/errors";

export type MediaPrincipal = {
  userId: string;
  dealerId: string;
  source: "web" | "mobile";
};

export type MediaAuthFailure = {
  ok: false;
  status: 401 | 403;
  code: V1ErrorCode | "AUTH_UNAUTHENTICATED";
};

export type MediaAuthSuccess = { ok: true; principal: MediaPrincipal };

function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

/**
 * Resolve who may request /api/media.
 * Prefer Bearer when present (native); otherwise Web cookie session.
 */
export async function resolveMediaPrincipal(
  req: Request
): Promise<MediaAuthSuccess | MediaAuthFailure> {
  const token = bearerFrom(req);
  if (token) {
    const resolved = await resolveMobileAccess(token);
    if (!resolved.ok) {
      return { ok: false, status: 401, code: resolved.code };
    }
    return {
      ok: true,
      principal: {
        userId: resolved.principal.userId,
        dealerId: resolved.principal.dealerId,
        source: "mobile",
      },
    };
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.dealerId) {
    return { ok: false, status: 401, code: "AUTH_UNAUTHENTICATED" };
  }
  return {
    ok: true,
    principal: {
      userId: session.user.id,
      dealerId: session.user.dealerId,
      source: "web",
    },
  };
}
