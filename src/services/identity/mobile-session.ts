import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  clearLoginFailures,
  isLoginBlocked,
  recordFailedLogin,
} from "@/lib/rate-limit";
import type { V1ErrorCode } from "@/lib/api-v1/errors";

export const MOBILE_ACCESS_TTL_MS = 15 * 60 * 1000;
export const MOBILE_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type MobileAuthFailure = { ok: false; code: V1ErrorCode };
export type MobilePrincipal = {
  userId: string;
  dealerId: string;
  email: string;
  name: string;
  dealerName: string;
  verificationStatus: string;
  emailVerifiedAt: string | null;
  accountStatus: string;
  dealerActive: boolean;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashMobileToken(token: string): string {
  return hashToken(token);
}

async function loadPrincipal(userId: string): Promise<
  { ok: true; principal: MobilePrincipal } | MobileAuthFailure
> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { dealer: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  if (user.accountStatus === "SUSPENDED") {
    return { ok: false, code: "PERMISSION_ACCOUNT_SUSPENDED" };
  }
  if (user.accountStatus !== "ACTIVE") {
    return { ok: false, code: "PERMISSION_DEALER_DISABLED" };
  }
  const membership = user.memberships[0];
  if (!membership) return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  if (!membership.dealer.isActive || membership.dealer.verificationStatus === "DISABLED") {
    return { ok: false, code: "PERMISSION_DEALER_DISABLED" };
  }
  return {
    ok: true,
    principal: {
      userId: user.id,
      dealerId: membership.dealerId,
      email: user.email,
      name: user.name,
      dealerName: membership.dealer.businessName,
      verificationStatus: membership.dealer.verificationStatus,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      accountStatus: user.accountStatus,
      dealerActive: membership.dealer.isActive,
    },
  };
}

export async function authenticateMobilePassword(params: {
  email: string;
  password: string;
  ip?: string;
}): Promise<{ ok: true; principal: MobilePrincipal } | MobileAuthFailure> {
  const email = params.email.trim().toLowerCase();
  if (!email || !params.password) {
    return { ok: false, code: "VALIDATION_INVALID_REQUEST" };
  }
  if (await isLoginBlocked(email, params.ip)) {
    return { ok: false, code: "RATE_LIMIT_EXCEEDED" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        include: { dealer: true },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user?.passwordHash) {
    await recordFailedLogin(email, params.ip);
    return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  }

  const valid = await bcrypt.compare(params.password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(email, params.ip);
    return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  }

  if (user.accountStatus === "SUSPENDED") {
    return { ok: false, code: "PERMISSION_ACCOUNT_SUSPENDED" };
  }
  if (user.accountStatus !== "ACTIVE") {
    return { ok: false, code: "PERMISSION_DEALER_DISABLED" };
  }

  const membership = user.memberships[0];
  if (user.role === "ADMIN" && !membership) {
    return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  }
  if (!membership) return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  if (!membership.dealer.isActive || membership.dealer.verificationStatus === "DISABLED") {
    return { ok: false, code: "PERMISSION_DEALER_DISABLED" };
  }

  await clearLoginFailures(email);
  return loadPrincipal(user.id);
}

export async function issueMobileSession(params: {
  userId: string;
  installationId?: string | null;
  platform?: string | null;
}) {
  const accessToken = newToken();
  const refreshToken = newToken();
  const now = Date.now();
  const row = await prisma.mobileSession.create({
    data: {
      userId: params.userId,
      familyId: newToken(),
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt: new Date(now + MOBILE_ACCESS_TTL_MS),
      refreshExpiresAt: new Date(now + MOBILE_REFRESH_TTL_MS),
      installationId: params.installationId ?? null,
      platform: params.platform ?? null,
    },
  });
  return {
    sessionId: row.id,
    familyId: row.familyId,
    accessToken,
    refreshToken,
    expiresIn: Math.floor(MOBILE_ACCESS_TTL_MS / 1000),
  };
}

export async function resolveMobileAccess(
  accessToken: string
): Promise<{ ok: true; principal: MobilePrincipal; sessionId: string } | MobileAuthFailure> {
  const accessTokenHash = hashToken(accessToken);
  const row = await prisma.mobileSession.findUnique({
    where: { accessTokenHash },
  });
  if (!row) return { ok: false, code: "AUTH_UNAUTHENTICATED" };
  if (row.revokedAt) return { ok: false, code: "AUTH_TOKEN_REVOKED" };
  if (row.accessExpiresAt.getTime() <= Date.now()) {
    return { ok: false, code: "AUTH_TOKEN_EXPIRED" };
  }
  const principal = await loadPrincipal(row.userId);
  if (!principal.ok) return principal;
  await prisma.mobileSession.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { ok: true, principal: principal.principal, sessionId: row.id };
}

export async function refreshMobileSession(refreshToken: string): Promise<
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      principal: MobilePrincipal;
    }
  | MobileAuthFailure
> {
  const refreshTokenHash = hashToken(refreshToken);
  const row = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash },
  });
  if (!row) return { ok: false, code: "AUTH_REFRESH_EXPIRED" };
  if (row.revokedAt) {
    await prisma.mobileSession.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: false, code: "AUTH_TOKEN_REVOKED" };
  }
  if (row.refreshExpiresAt.getTime() <= Date.now()) {
    await prisma.mobileSession.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return { ok: false, code: "AUTH_REFRESH_EXPIRED" };
  }

  const principal = await loadPrincipal(row.userId);
  if (!principal.ok) {
    await prisma.mobileSession.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return principal;
  }

  const accessToken = newToken();
  const nextRefresh = newToken();
  const now = Date.now();
  await prisma.$transaction([
    prisma.mobileSession.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    }),
    prisma.mobileSession.create({
      data: {
        userId: row.userId,
        familyId: row.familyId,
        accessTokenHash: hashToken(accessToken),
        refreshTokenHash: hashToken(nextRefresh),
        accessExpiresAt: new Date(now + MOBILE_ACCESS_TTL_MS),
        refreshExpiresAt: new Date(now + MOBILE_REFRESH_TTL_MS),
        installationId: row.installationId,
        platform: row.platform,
      },
    }),
  ]);

  return {
    ok: true,
    accessToken,
    refreshToken: nextRefresh,
    expiresIn: Math.floor(MOBILE_ACCESS_TTL_MS / 1000),
    principal: principal.principal,
  };
}

export async function revokeMobileRefresh(refreshToken: string): Promise<void> {
  const refreshTokenHash = hashToken(refreshToken);
  const row = await prisma.mobileSession.findUnique({
    where: { refreshTokenHash },
  });
  if (!row) return;
  await prisma.mobileSession.updateMany({
    where: { familyId: row.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllMobileSessionsForUser(userId: string): Promise<number> {
  const result = await prisma.mobileSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
