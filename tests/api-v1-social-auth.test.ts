import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    externalIdentity: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    dealerMembership: { findFirst: vi.fn() },
    dealer: { create: vi.fn() },
    mobileSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/services/events/log-event", () => ({
  logAppEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/entitlements", () => ({
  getDealerEntitlement: vi.fn().mockResolvedValue({}),
  startTrial: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/services/commercial/reveal-usage", () => ({
  ensureDealerCommercial: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/product-policy", () => ({
  isMonetizationEnabled: vi.fn().mockResolvedValue(false),
  isTrialEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/services/privacy/policy", () => ({
  hasCompletedPrivacyAiV1: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/rate-limit", () => ({
  isLoginBlocked: vi.fn().mockResolvedValue(false),
  recordFailedLogin: vi.fn().mockResolvedValue(undefined),
  clearLoginFailures: vi.fn().mockResolvedValue(undefined),
}));

import { encodeFakeAppleToken } from "@/services/identity/apple-provider";
import { encodeFakeGoogleToken } from "@/services/identity/google-provider";
import { POST as socialPost } from "@/app/api/v1/auth/social/route";
import { POST as linkPost } from "@/app/api/v1/auth/link/route";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const membership = {
  dealerId: "dealer-1",
  dealer: {
    id: "dealer-1",
    businessName: "Test Motors",
    isActive: true,
    verificationStatus: "VERIFIED",
    phone: "0500000000",
    contactName: "Dealer",
    city: null,
    region: null,
  },
};

const userRow = {
  id: "user-1",
  email: "dealer@example.com",
  name: "Dealer",
  passwordHash: null as string | null,
  emailVerifiedAt: new Date(),
  accountStatus: "ACTIVE",
  role: "DEALER_USER",
  memberships: [membership],
};

function mockPrincipalUser(overrides: Partial<typeof userRow> = {}) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    ...userRow,
    ...overrides,
    memberships: [membership],
  } as never);
}

describe("v1 social auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDENTITY_PROVIDER_MODE = "fake";
    delete process.env.APPLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_IOS_CLIENT_ID;
    vi.mocked(prisma.mobileSession.create).mockResolvedValue({
      id: "sess-1",
      familyId: "fam-1",
    } as never);
    vi.mocked(prisma.dealerMembership.findFirst).mockResolvedValue(
      membership as never
    );
  });

  it("creates session for new Apple subject", async () => {
    vi.mocked(prisma.externalIdentity.findUnique).mockResolvedValue(null);
    const created = {
      ...userRow,
      id: "user-new",
      email: "newapple@example.com",
    };
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // email collision check
      .mockResolvedValue(created as never); // loadPrincipal
    vi.mocked(prisma.user.create).mockResolvedValue(created as never);

    const token = encodeFakeAppleToken({
      sub: "apple-sub-1",
      email: "newapple@example.com",
      email_verified: true,
    });
    const res = await socialPost(
      new Request("http://local/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_s1" },
        body: JSON.stringify({ provider: "apple", idToken: token, platform: "ios" }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      me: { user: { id: string } };
      created: boolean;
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.me.user.id).toBe("user-new");
    expect(body.created).toBe(true);
  });

  it("returning Apple subject reuses linked user (no duplicate)", async () => {
    vi.mocked(prisma.externalIdentity.findUnique).mockResolvedValue({
      id: "eid-1",
      userId: "user-1",
      provider: "APPLE",
      providerSubject: "apple-sub-returning",
      verifiedEmail: "dealer@example.com",
      user: userRow,
    } as never);
    vi.mocked(prisma.externalIdentity.update).mockResolvedValue({} as never);
    mockPrincipalUser();

    const token = encodeFakeAppleToken({
      sub: "apple-sub-returning",
      email: "dealer@example.com",
      email_verified: true,
    });
    const res = await socialPost(
      new Request("http://local/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_s1b" },
        body: JSON.stringify({ provider: "apple", idToken: token }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: boolean; me: { user: { id: string } } };
    expect(body.created).toBe(false);
    expect(body.me.user.id).toBe("user-1");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns IDENTITY_LINK_REQUIRED when email belongs to password user", async () => {
    vi.mocked(prisma.externalIdentity.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...userRow,
      passwordHash: await bcrypt.hash("Secret1!", 4),
      externalIdentities: [],
    } as never);

    const token = encodeFakeGoogleToken({
      sub: "google-sub-1",
      email: "dealer@example.com",
      email_verified: true,
    });
    const res = await socialPost(
      new Request("http://local/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_s2" },
        body: JSON.stringify({ provider: "google", idToken: token }),
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IDENTITY_LINK_REQUIRED");
  });

  it("rejects provider subject already linked to another user", async () => {
    const hash = await bcrypt.hash("Secret1!", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...userRow,
      passwordHash: hash,
      memberships: [membership],
    } as never);
    vi.mocked(prisma.externalIdentity.findUnique).mockResolvedValue({
      id: "eid-other",
      userId: "user-other",
      provider: "GOOGLE",
      providerSubject: "google-taken",
    } as never);

    const token = encodeFakeGoogleToken({
      sub: "google-taken",
      email: "dealer@example.com",
      email_verified: true,
    });
    const res = await linkPost(
      new Request("http://local/api/v1/auth/link", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_l2" },
        body: JSON.stringify({
          email: "dealer@example.com",
          password: "Secret1!",
          provider: "google",
          idToken: token,
        }),
      })
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IDENTITY_PROVIDER_TAKEN");
  });

  it("link requires password of existing account and then issues session", async () => {
    const hash = await bcrypt.hash("Secret1!", 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...userRow,
      passwordHash: hash,
      memberships: [membership],
    } as never);
    vi.mocked(prisma.externalIdentity.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.externalIdentity.create).mockResolvedValue({ id: "eid-1" } as never);

    const token = encodeFakeAppleToken({
      sub: "apple-link-1",
      email: "dealer@example.com",
      email_verified: true,
    });
    const res = await linkPost(
      new Request("http://local/api/v1/auth/link", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_l1" },
        body: JSON.stringify({
          email: "dealer@example.com",
          password: "Secret1!",
          provider: "apple",
          idToken: token,
          platform: "ios",
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { linked: boolean; accessToken: string };
    expect(body.linked).toBe(true);
    expect(body.accessToken).toBeTruthy();
  });

  it("rejects invalid fake token", async () => {
    const res = await socialPost(
      new Request("http://local/api/v1/auth/social", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_bad" },
        body: JSON.stringify({ provider: "apple", idToken: "not-a-token-at-all-xx" }),
      })
    );
    expect(res.status).toBe(401);
  });
});
