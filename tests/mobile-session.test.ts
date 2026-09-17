import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    mobileSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  authenticateMobilePassword,
  hashMobileToken,
  issueMobileSession,
  refreshMobileSession,
  resolveMobileAccess,
  revokeMobileRefresh,
  MOBILE_ACCESS_TTL_MS,
} from "@/services/identity/mobile-session";

const userFindUnique = vi.mocked(prisma.user.findUnique);
const sessionCreate = vi.mocked(prisma.mobileSession.create);
const sessionFindUnique = vi.mocked(prisma.mobileSession.findUnique);
const sessionUpdate = vi.mocked(prisma.mobileSession.update);
const sessionUpdateMany = vi.mocked(prisma.mobileSession.updateMany);

const dealer = {
  id: "dealer-a",
  businessName: "סוחר א",
  isActive: true,
  verificationStatus: "VERIFIED",
};

function activeUser(overrides?: Record<string, unknown>) {
  return {
    id: "user-a",
    email: "a@example.com",
    name: "דילר א",
    passwordHash: bcrypt.hashSync("secret-pass", 4),
    accountStatus: "ACTIVE",
    role: "DEALER_USER",
    emailVerifiedAt: new Date("2026-01-01"),
    memberships: [{ dealerId: "dealer-a", createdAt: new Date(), dealer }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation(async (ops: unknown) => ops);
});

describe("mobile session hashing", () => {
  it("stores sha256 hex, never the raw token", () => {
    const token = "plaintext-access-token-value";
    const hashed = hashMobileToken(token);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(token);
    expect(hashMobileToken(token)).toBe(hashed);
  });
});

describe("authenticateMobilePassword", () => {
  it("rejects a suspended account", async () => {
    userFindUnique.mockResolvedValue(
      activeUser({ accountStatus: "SUSPENDED" }) as never
    );
    const result = await authenticateMobilePassword({
      email: "a@example.com",
      password: "secret-pass",
    });
    expect(result).toEqual({ ok: false, code: "PERMISSION_ACCOUNT_SUSPENDED" });
  });

  it("rejects a disabled dealer", async () => {
    userFindUnique.mockResolvedValue(
      activeUser({
        memberships: [
          {
            dealerId: "dealer-a",
            createdAt: new Date(),
            dealer: { ...dealer, isActive: false, verificationStatus: "DISABLED" },
          },
        ],
      }) as never
    );
    const result = await authenticateMobilePassword({
      email: "a@example.com",
      password: "secret-pass",
    });
    expect(result).toEqual({ ok: false, code: "PERMISSION_DEALER_DISABLED" });
  });

  it("does not leak whether the email exists", async () => {
    userFindUnique.mockResolvedValue(null);
    const result = await authenticateMobilePassword({
      email: "missing@example.com",
      password: "secret-pass",
    });
    expect(result).toEqual({ ok: false, code: "AUTH_UNAUTHENTICATED" });
  });
});

describe("issue / resolve / rotate / revoke", () => {
  it("issues hashed tokens and resolves live membership", async () => {
    sessionCreate.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({
      id: "sess-1",
      ...data,
    })) as never);
    userFindUnique.mockResolvedValue(activeUser() as never);
    const issued = await issueMobileSession({ userId: "user-a" });
    expect(issued.accessToken).toBeTruthy();
    expect(issued.refreshToken).toBeTruthy();
    expect(issued.expiresIn).toBe(Math.floor(MOBILE_ACCESS_TTL_MS / 1000));
    const createData = sessionCreate.mock.calls[0][0].data;
    expect(createData.accessTokenHash).toBe(hashMobileToken(issued.accessToken));
    expect(createData.refreshTokenHash).toBe(hashMobileToken(issued.refreshToken));
    expect(JSON.stringify(createData)).not.toContain(issued.accessToken);

    sessionFindUnique.mockResolvedValue({
      id: "sess-1",
      userId: "user-a",
      familyId: issued.familyId,
      revokedAt: null,
      accessExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    sessionUpdate.mockResolvedValue({} as never);
    const resolved = await resolveMobileAccess(issued.accessToken);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.principal.dealerId).toBe("dealer-a");
      expect(resolved.principal.email).toBe("a@example.com");
    }
  });

  it("rejects expired access tokens", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "sess-1",
      userId: "user-a",
      revokedAt: null,
      accessExpiresAt: new Date(Date.now() - 1000),
    } as never);
    const result = await resolveMobileAccess("expired-token-value-xxxxx");
    expect(result).toEqual({ ok: false, code: "AUTH_TOKEN_EXPIRED" });
  });

  it("rotates refresh and revokes the family on reuse", async () => {
    const familyId = "fam-1";
    sessionFindUnique.mockResolvedValueOnce({
      id: "sess-old",
      userId: "user-a",
      familyId,
      revokedAt: null,
      refreshExpiresAt: new Date(Date.now() + 86_400_000),
      installationId: null,
      platform: "ios",
    } as never);
    userFindUnique.mockResolvedValue(activeUser() as never);
    sessionUpdate.mockResolvedValue({} as never);
    sessionCreate.mockResolvedValue({ id: "sess-new" } as never);

    const rotated = await refreshMobileSession("refresh-token-value-xxxxx");
    expect(rotated.ok).toBe(true);

    sessionFindUnique.mockResolvedValueOnce({
      id: "sess-old",
      userId: "user-a",
      familyId,
      revokedAt: new Date(),
      refreshExpiresAt: new Date(Date.now() + 86_400_000),
    } as never);
    sessionUpdateMany.mockResolvedValue({ count: 1 });
    const reuse = await refreshMobileSession("refresh-token-value-xxxxx");
    expect(reuse).toEqual({ ok: false, code: "AUTH_TOKEN_REVOKED" });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { familyId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("logout revokes the whole family", async () => {
    sessionFindUnique.mockResolvedValue({
      id: "sess-1",
      familyId: "fam-9",
    } as never);
    sessionUpdateMany.mockResolvedValue({ count: 2 });
    await revokeMobileRefresh("refresh-token-value-xxxxx");
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-9", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
