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
}));

vi.mock("@/services/privacy/policy", () => ({
  hasCompletedPrivacyAiV1: vi.fn(async () => true),
  completePrivacyAiOnboarding: vi.fn(async () => undefined),
  getConsentState: vi.fn(async () => ({
    DEALER_MEMORY: false,
    AGENT_TO_EXCHANGE_LEARNING: false,
    EXCHANGE_ACTIVITY_LEARNING: false,
    EXTERNAL_ACTIVITY_LEARNING: false,
  })),
  listConsentHistory: vi.fn(async () => []),
  recordConsentDecision: vi.fn(async () => ({ id: "dec-1" })),
}));

vi.mock("@/services/privacy/deletion", () => ({
  requestAccountDeletion: vi.fn(),
  confirmAccountDeletion: vi.fn(),
}));

vi.mock("@/services/inventory/list-inventory", () => ({
  getInventoryList: vi.fn(),
}));

vi.mock("@/services/demand/demand-queries", () => ({
  getEnrichedDemandsForDealer: vi.fn(),
}));

vi.mock("@/services/domain/matching-flow", () => ({
  recordSellerInterest: vi.fn(),
  confirmAvailabilityValidation: vi.fn(),
  computeDemandExpiry: vi.fn(() => new Date()),
  runMatchingForDemand: vi.fn(),
}));

vi.mock("@/services/commercial/reveal-usage", () => ({
  canDealerReveal: vi.fn(async () => true),
}));

vi.mock("@/services/commercial/reveal-flow", () => ({
  getRevealForDealer: vi.fn(),
  submitOutcome: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sellerOpportunity: { findMany: vi.fn(), findFirst: vi.fn() },
    notification: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    dealer: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/privacy-views", () => ({
  toSellerOpportunityView: vi.fn(() => ({
    summary: "anonymous",
  })),
}));

vi.mock("@/services/events/log-event", () => ({
  logEvent: vi.fn(async () => undefined),
}));

vi.mock("@/services/assistant/assistant-chat-turn", () => ({
  getAssistantConversationPayload: vi.fn(async () => ({
    conversation: {},
    recentTurns: [],
  })),
  runAssistantChatTurn: vi.fn(),
}));

vi.mock("@/services/intake/batch", () => ({
  listIntakeBatchesForDealer: vi.fn(async () => []),
  getIntakeBatchForDealer: vi.fn(),
  createOrResumeIntakeBatch: vi.fn(),
  addIntakeMedia: vi.fn(),
  addIntakeText: vi.fn(),
  acknowledgeIntakeBatch: vi.fn(),
}));

vi.mock("@/services/customers", () => ({
  listCustomersForDealer: vi.fn(async () => []),
  getCustomerForDealer: vi.fn(),
  upsertCustomerForDealer: vi.fn(),
  archiveCustomer: vi.fn(),
  attachDemandToCustomer: vi.fn(),
}));

vi.mock("@/services/opportunities/dealer-opportunity", () => ({
  listOpenDealerOpportunities: vi.fn(async () => []),
  refreshDealerOpportunitySources: vi.fn(async () => ({})),
  dismissDealerOpportunity: vi.fn(),
}));

import { resolveMobileAccess } from "@/services/identity/mobile-session";
import {
  hasCompletedPrivacyAiV1,
  completePrivacyAiOnboarding,
  getConsentState,
  recordConsentDecision,
} from "@/services/privacy/policy";
import {
  requestAccountDeletion,
  confirmAccountDeletion,
} from "@/services/privacy/deletion";
import { getInventoryList } from "@/services/inventory/list-inventory";
import { getEnrichedDemandsForDealer } from "@/services/demand/demand-queries";
import { recordSellerInterest } from "@/services/domain/matching-flow";
import { getRevealForDealer } from "@/services/commercial/reveal-flow";
import { prisma } from "@/lib/prisma";
import {
  getAssistantConversationPayload,
  runAssistantChatTurn,
} from "@/services/assistant/assistant-chat-turn";
import { listIntakeBatchesForDealer } from "@/services/intake/batch";
import { listCustomersForDealer } from "@/services/customers";
import {
  listOpenDealerOpportunities,
  refreshDealerOpportunitySources,
} from "@/services/opportunities/dealer-opportunity";
import { GET as v1Inventory } from "@/app/api/v1/inventory/route";
import { GET as v1DemandDetail } from "@/app/api/v1/demands/[id]/route";
import {
  GET as v1Opportunities,
  POST as v1OpportunityInterest,
} from "@/app/api/v1/opportunities/route";
import { GET as v1Reveal } from "@/app/api/v1/reveals/[id]/route";
import { GET as v1Notifications } from "@/app/api/v1/notifications/route";
import { POST as v1PrivacyComplete } from "@/app/api/v1/privacy/onboarding/complete/route";
import { POST as v1AccountDeletion } from "@/app/api/v1/privacy/account-deletion/route";
import { GET as v1PrivacyStatus } from "@/app/api/v1/privacy/status/route";
import {
  GET as v1PrivacyConsents,
  PATCH as v1PrivacyConsentsPatch,
} from "@/app/api/v1/privacy/consents/route";
import {
  GET as v1AssistantChat,
  POST as v1AssistantChatPost,
} from "@/app/api/v1/assistant/chat/route";
import { GET as v1IntakeBatch } from "@/app/api/v1/intake/batch/route";
import { GET as v1Customers } from "@/app/api/v1/customers/route";
import { GET as v1DealerOpportunities } from "@/app/api/v1/dealer-opportunities/route";

function authReq(path: string, token = "token-a", extra?: RequestInit) {
  return new Request(`http://local${path}`, {
    ...extra,
    headers: {
      authorization: `Bearer ${token}`,
      "x-request-id": "req_core",
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
  vi.mocked(hasCompletedPrivacyAiV1).mockResolvedValue(true);
});

describe("privacy gate on product routes", () => {
  it("returns 403 PERMISSION_PRIVACY_INCOMPLETE on inventory", async () => {
    vi.mocked(hasCompletedPrivacyAiV1).mockResolvedValue(false);
    const res = await v1Inventory(authReq("/api/v1/inventory"));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PERMISSION_PRIVACY_INCOMPLETE");
    expect(getInventoryList).not.toHaveBeenCalled();
  });

});

describe("assistant requires verified + privacy", () => {
  it("GET chat returns PERMISSION_PRIVACY_INCOMPLETE when privacy incomplete", async () => {
    vi.mocked(hasCompletedPrivacyAiV1).mockResolvedValue(false);
    const res = await v1AssistantChat(authReq("/api/v1/assistant/chat"));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PERMISSION_PRIVACY_INCOMPLETE");
    expect(getAssistantConversationPayload).not.toHaveBeenCalled();
  });

  it("POST chat returns PERMISSION_DEALER_UNVERIFIED when not verified", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: { ...principalA, verificationStatus: "PENDING" },
      sessionId: "sess-a",
    });
    const res = await v1AssistantChatPost(
      authReq("/api/v1/assistant/chat", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "שלום" }),
      })
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PERMISSION_DEALER_UNVERIFIED");
    expect(runAssistantChatTurn).not.toHaveBeenCalled();
  });

  it("POST confirm maps to chat turn with אשר/בטל", async () => {
    const { POST: v1AssistantConfirm } = await import(
      "@/app/api/v1/assistant/confirm/route"
    );
    vi.mocked(runAssistantChatTurn).mockResolvedValue({
      ok: true,
      body: { message: "בוצע", conversation: {} },
    });
    const res = await v1AssistantConfirm(
      authReq("/api/v1/assistant/confirm", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, action: "confirm_inventory_import" }),
      })
    );
    expect(res.status).toBe(200);
    expect(runAssistantChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: "dealer-a",
        userId: "user-a",
        message: "אשר",
      })
    );
  });
});

describe("Dealer A ≠ Dealer B isolation", () => {
  it("demand detail is scoped to session dealerId", async () => {
    vi.mocked(getEnrichedDemandsForDealer).mockResolvedValue([]);
    const res = await v1DemandDetail(
      authReq("/api/v1/demands/demand-b?dealerId=dealer-b"),
      { params: Promise.resolve({ id: "demand-b" }) }
    );
    expect(res.status).toBe(404);
    expect(getEnrichedDemandsForDealer).toHaveBeenCalledWith(
      "dealer-a",
      expect.objectContaining({ includeHistory: true })
    );
  });

  it("opportunities GET uses session dealerId only", async () => {
    vi.mocked(prisma.sellerOpportunity.findMany).mockResolvedValue([] as never);
    await v1Opportunities(
      authReq("/api/v1/opportunities?dealerId=dealer-b")
    );
    expect(prisma.sellerOpportunity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vehicle: { dealerId: "dealer-a" } },
      })
    );
  });

  it("reveal GET uses session dealerId; foreign reveal is forbidden", async () => {
    vi.mocked(getRevealForDealer).mockRejectedValue(new Error("FORBIDDEN"));
    const res = await v1Reveal(authReq("/api/v1/reveals/reveal-b"), {
      params: Promise.resolve({ id: "reveal-b" }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PERMISSION_FORBIDDEN");
    expect(getRevealForDealer).toHaveBeenCalledWith("reveal-b", "dealer-a");
  });

  it("notifications are listed for principal.userId only", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.notification.count).mockResolvedValue(0);
    await v1Notifications(
      authReq("/api/v1/notifications?userId=user-a", "token-b")
    );
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-b" }),
      })
    );
    expect(prisma.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-b", readAt: null },
      })
    );
  });

  it("intake batch list uses session dealerId only (A≠B)", async () => {
    await v1IntakeBatch(
      authReq("/api/v1/intake/batch?dealerId=dealer-b")
    );
    expect(listIntakeBatchesForDealer).toHaveBeenCalledWith("dealer-a");
    expect(listIntakeBatchesForDealer).not.toHaveBeenCalledWith("dealer-b");
  });

  it("customers list uses session dealerId only (A≠B)", async () => {
    await v1Customers(authReq("/api/v1/customers?dealerId=dealer-b&q=x"));
    expect(listCustomersForDealer).toHaveBeenCalledWith("dealer-a", {
      q: "x",
    });
  });

  it("dealer-opportunities uses session dealerId only (A≠B)", async () => {
    await v1DealerOpportunities(
      authReq("/api/v1/dealer-opportunities?dealerId=dealer-b")
    );
    expect(refreshDealerOpportunitySources).toHaveBeenCalledWith("dealer-a");
    expect(listOpenDealerOpportunities).toHaveBeenCalledWith("dealer-a");
  });
});

describe("opportunity interest error mapping", () => {
  it("maps stale_opportunity to MATCH_STALE_OPPORTUNITY", async () => {
    vi.mocked(recordSellerInterest).mockResolvedValue({
      error: "stale_opportunity",
      reason: "demand_ineligible",
    } as never);
    const res = await v1OpportunityInterest(
      authReq("/api/v1/opportunities", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunityId: "opp-1",
          action: "interested",
          dealerId: "dealer-b",
        }),
      })
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("MATCH_STALE_OPPORTUNITY");
    expect(recordSellerInterest).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: "opp-1",
        dealerId: "dealer-a",
        userId: "user-a",
        status: "INTERESTED",
      })
    );
  });
});

describe("privacy onboarding complete", () => {
  it("succeeds with requireV1Dealer (no privacy gate)", async () => {
    vi.mocked(hasCompletedPrivacyAiV1).mockResolvedValue(false);
    const res = await v1PrivacyComplete(
      authReq("/api/v1/privacy/onboarding/complete", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consents: {
            DEALER_MEMORY: true,
            AGENT_TO_EXCHANGE_LEARNING: false,
            EXCHANGE_ACTIVITY_LEARNING: true,
            EXTERNAL_ACTIVITY_LEARNING: false,
          },
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(completePrivacyAiOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        dealerId: "dealer-a",
        source: "privacy_ai_onboarding",
      })
    );
  });
});

describe("privacy account-deletion", () => {
  it("owner-only: non-owner gets PERMISSION_FORBIDDEN", async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValue({
      ok: false as const,
      error: "only_owner",
      message: "רק בעל החשבון יכול לבקש מחיקת חשבון.",
    });
    const res = await v1AccountDeletion(
      authReq("/api/v1/privacy/account-deletion", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      })
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("PERMISSION_FORBIDDEN");
    expect(requestAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        dealerId: "dealer-a",
      })
    );
  });

  it("A≠B: dealer B token scopes deletion to dealer-b only", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    vi.mocked(requestAccountDeletion).mockResolvedValue({
      ok: true as const,
      request: {
        id: "del-b",
        userId: "user-b",
        dealerId: "dealer-b",
        status: "PENDING",
      } as never,
    });
    const res = await v1AccountDeletion(
      authReq("/api/v1/privacy/account-deletion", "token-b", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "request",
          dealerId: "dealer-a",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(requestAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-b",
        dealerId: "dealer-b",
      })
    );
    expect(requestAccountDeletion).not.toHaveBeenCalledWith(
      expect.objectContaining({ dealerId: "dealer-a" })
    );
  });

  it("confirm uses session dealerId (A≠B)", async () => {
    vi.mocked(confirmAccountDeletion).mockResolvedValue({ ok: true as const });
    const res = await v1AccountDeletion(
      authReq("/api/v1/privacy/account-deletion", "token-a", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          requestId: "req-1",
          dealerId: "dealer-b",
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(confirmAccountDeletion).toHaveBeenCalledWith({
      userId: "user-a",
      dealerId: "dealer-a",
      requestId: "req-1",
    });
  });
});

describe("privacy status + consents", () => {
  it("GET status returns consents + completion for session dealer", async () => {
    const res = await v1PrivacyStatus(authReq("/api/v1/privacy/status"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      hasCompletedPrivacyAiV1: boolean;
      consents: Record<string, boolean>;
    };
    expect(json.hasCompletedPrivacyAiV1).toBe(true);
    expect(json.consents).toBeTruthy();
    expect(getConsentState).toHaveBeenCalledWith("dealer-a");
  });

  it("PATCH consents records single decision (not onboarding complete)", async () => {
    const res = await v1PrivacyConsentsPatch(
      authReq("/api/v1/privacy/consents", "token-a", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consentType: "DEALER_MEMORY",
          value: true,
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(recordConsentDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        dealerId: "dealer-a",
        consentType: "DEALER_MEMORY",
        value: true,
      })
    );
    expect(completePrivacyAiOnboarding).not.toHaveBeenCalled();
  });

  it("GET consents A≠B uses session dealerId", async () => {
    vi.mocked(resolveMobileAccess).mockResolvedValue({
      ok: true,
      principal: principalB,
      sessionId: "sess-b",
    });
    const res = await v1PrivacyConsents(authReq("/api/v1/privacy/consents", "token-b"));
    expect(res.status).toBe(200);
    expect(getConsentState).toHaveBeenCalledWith("dealer-b");
    expect(getConsentState).not.toHaveBeenCalledWith("dealer-a");
  });
});
