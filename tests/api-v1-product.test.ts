import { describe, expect, it, beforeEach, vi } from "vitest";

const principalA = {
  userId: "user-a",
  dealerId: "dealer-a",
  email: "a@example.com",
  name: "דילר א",
  dealerName: "סוחר א",
  verificationStatus: "VERIFIED",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  accountStatus: "ACTIVE",
  dealerActive: true,
};

const principalB = {
  ...principalA,
  userId: "user-b",
  dealerId: "dealer-b",
  email: "b@example.com",
  name: "דילר ב",
  dealerName: "סוחר ב",
};

vi.mock("@/services/identity/mobile-session", () => ({
  resolveMobileAccess: vi.fn(),
  authenticateMobilePassword: vi.fn(),
  issueMobileSession: vi.fn(),
  refreshMobileSession: vi.fn(),
  revokeMobileRefresh: vi.fn(),
  hashMobileToken: vi.fn(() => "hashed-refresh-token"),
  loadPrincipalForUserId: vi.fn(),
}));

vi.mock("@/services/devices/installations", () => ({
  revokeInstallation: vi.fn().mockResolvedValue({ revoked: 0 }),
}));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prisma")>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      mobileSession: {
        ...(actual.prisma as { mobileSession?: object }).mobileSession,
        findUnique: vi.fn().mockResolvedValue(null),
      },
    },
  };
});

vi.mock("@/services/privacy/policy", () => ({
  hasCompletedPrivacyAiV1: vi.fn(async () => true),
}));

vi.mock("@/services/dealer/work-center", () => ({
  getWorkCenterSnapshot: vi.fn(),
}));

vi.mock("@/services/inventory/list-inventory", () => ({
  getInventoryList: vi.fn(),
}));

vi.mock("@/services/matching/list-buyer-matches", () => ({
  listBuyerMatches: vi.fn(),
  getBuyerMatchForDealer: vi.fn(),
}));

vi.mock("@/services/domain/matching-flow", () => ({
  recordBuyerInterest: vi.fn(),
}));

vi.mock("@/services/commercial/reveal-usage", () => ({
  canDealerReveal: vi.fn(async () => true),
}));

import {
  authenticateMobilePassword,
  issueMobileSession,
  resolveMobileAccess,
} from "@/services/identity/mobile-session";
import { GET as v1Me } from "@/app/api/v1/me/route";
import { POST as v1Login } from "@/app/api/v1/auth/login/route";
import { POST as v1Logout } from "@/app/api/v1/auth/logout/route";
import { revokeMobileRefresh } from "@/services/identity/mobile-session";
import { GET as v1Home } from "@/app/api/v1/home/route";
import { GET as v1Inventory } from "@/app/api/v1/inventory/route";
import { GET as v1Matches } from "@/app/api/v1/matches/route";
import { GET as v1MatchDetail } from "@/app/api/v1/matches/[id]/route";
import { POST as v1Interest } from "@/app/api/v1/matches/[id]/interest/route";
import { getWorkCenterSnapshot } from "@/services/dealer/work-center";
import { getInventoryList } from "@/services/inventory/list-inventory";
import {
  getBuyerMatchForDealer,
  listBuyerMatches,
} from "@/services/matching/list-buyer-matches";
import { recordBuyerInterest } from "@/services/domain/matching-flow";

function authReq(path: string, token = "token-a", extra?: RequestInit) {
  return new Request(`http://local${path}`, {
    ...extra,
    headers: {
      authorization: `Bearer ${token}`,
      "x-request-id": "req_iso",
      ...(extra?.headers as Record<string, string> | undefined),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveMobileAccess).mockResolvedValue({
    ok: true,
    principal: principalA,
    sessionId: "sess-a",
  });
});

describe("POST /api/v1/auth/login", () => {
  it("rejects a suspended dealer with the stable code", async () => {
    vi.mocked(authenticateMobilePassword).mockResolvedValue({
      ok: false,
      code: "PERMISSION_ACCOUNT_SUSPENDED",
    });
    const res = await v1Login(
      new Request("http://local/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "req_login" },
        body: JSON.stringify({ email: "a@example.com", password: "x" }),
      })
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PERMISSION_ACCOUNT_SUSPENDED");
  });

  it("returns tokens without accepting a client dealerId as identity", async () => {
    vi.mocked(authenticateMobilePassword).mockResolvedValue({
      ok: true,
      principal: principalA,
    });
    vi.mocked(issueMobileSession).mockResolvedValue({
      sessionId: "sess-a",
      familyId: "fam-a",
      accessToken: "access-a",
      refreshToken: "refresh-a-token-value",
      expiresIn: 900,
    });
    const res = await v1Login(
      new Request("http://local/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "a@example.com",
          password: "x",
          dealerId: "dealer-b",
        }),
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { me: { dealer: { id: string } } };
    expect(json.me.dealer.id).toBe("dealer-a");
    expect(issueMobileSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-a" })
    );
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the refresh family", async () => {
    vi.mocked(revokeMobileRefresh).mockResolvedValue();
    const res = await v1Logout(
      new Request("http://local/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: "refresh-token-value-xxxxx" }),
      })
    );
    expect(res.status).toBe(200);
    expect(revokeMobileRefresh).toHaveBeenCalledWith("refresh-token-value-xxxxx");
  });
});

describe("GET /api/v1/me", () => {
  it("returns the server-derived dealer, never a client dealerId", async () => {
    const res = await v1Me(authReq("/api/v1/me"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      dealer: { id: string };
      user: { id: string };
    };
    expect(json.dealer.id).toBe("dealer-a");
    expect(json.user.id).toBe("user-a");
  });

  it("returns AUTH_UNAUTHENTICATED without a bearer", async () => {
    const res = await v1Me(new Request("http://local/api/v1/me"));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("AUTH_UNAUTHENTICATED");
  });
});

describe("Dealer A ≠ Dealer B", () => {
  it("inventory is queried only with the session dealerId", async () => {
    vi.mocked(getInventoryList).mockResolvedValue({
      vehicles: [{ id: "veh-a", make: "טויוטה" }],
      snapshot: { total: 1 },
      pagination: { page: 1, pageSize: 30, totalCount: 1, returnedCount: 1, hasMore: false },
    } as never);
    const res = await v1Inventory(
      authReq("/api/v1/inventory?dealerId=dealer-b&filter=active")
    );
    expect(res.status).toBe(200);
    expect(getInventoryList).toHaveBeenCalledWith(
      expect.objectContaining({ dealerId: "dealer-a" })
    );
    expect(getInventoryList).not.toHaveBeenCalledWith(
      expect.objectContaining({ dealerId: "dealer-b" })
    );
  });

  it("matches are queried only with the session dealerId", async () => {
    vi.mocked(listBuyerMatches).mockResolvedValue([]);
    await v1Matches(authReq("/api/v1/matches?dealerId=dealer-b"));
    expect(listBuyerMatches).toHaveBeenCalledWith(
      "dealer-a",
      expect.objectContaining({ demandId: undefined })
    );
  });

  it("match detail is 404 when the match is not owned by the session dealer", async () => {
    vi.mocked(getBuyerMatchForDealer).mockResolvedValue(null);
    const res = await v1MatchDetail(authReq("/api/v1/matches/match-b"), {
      params: Promise.resolve({ id: "match-b" }),
    });
    expect(res.status).toBe(404);
    expect(getBuyerMatchForDealer).toHaveBeenCalledWith("dealer-a", "match-b");
  });

  it("interest records against the session dealer, not a body dealerId", async () => {
    vi.mocked(recordBuyerInterest).mockResolvedValue({ ok: true } as never);
    const res = await v1Interest(
      authReq("/api/v1/matches/match-a/interest", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "interested",
          dealerId: "dealer-b",
        }),
      }),
      { params: Promise.resolve({ id: "match-a" }) }
    );
    expect(res.status).toBe(200);
    expect(recordBuyerInterest).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateMatchId: "match-a",
        dealerId: "dealer-a",
        userId: "user-a",
        status: "INTERESTED",
      })
    );
  });

  it("dealer B token cannot read dealer A home via a query param", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    vi.mocked(getWorkCenterSnapshot).mockResolvedValue({
      actionItems: [],
      activeDemands: 0,
      inventoryCount: 2,
      matches: 0,
      opportunities: 0,
      pendingOutcomes: 0,
      recentReveals: 0,
      connectionsLabel: "",
      connectionsSecondary: "",
      setupStatus: {},
      notifications: [],
    } as never);
    await v1Home(authReq("/api/v1/home?dealerId=dealer-a", "token-b"));
    expect(getWorkCenterSnapshot).toHaveBeenCalledWith("dealer-b", "user-b");
  });
});

describe("privacy DTO on matches", () => {
  it("does not expose seller fields from the list mapper contract", async () => {
    vi.mocked(listBuyerMatches).mockResolvedValue([
      {
        id: "m1",
        demandId: "d1",
        status: "PRESENTED",
        vehicle: {
          make: "טויוטה",
          model: "קורולה",
          trim: null,
          year: 2020,
          mileage: 50000,
          color: "לבן",
          region: "מרכז",
          ownershipHand: 1,
          ownershipType: null,
          fuelType: null,
          engineDisplacementCc: null,
          features: [],
          verifiedDealer: true,
          imageUrl: null,
        },
        interest: null,
        revealId: null,
        dealerFacingState: "MATCH_FOUND",
      },
    ]);
    const res = await v1Matches(authReq("/api/v1/matches"));
    const json = (await res.json()) as { items: Array<Record<string, unknown>> };
    const blob = JSON.stringify(json);
    expect(blob).not.toMatch(/b2bPrice|dealerId|scoreBand|seller/);
    expect(json.items[0].id).toBe("m1");
  });
});
