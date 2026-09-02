import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_READ_TOOLS } from "@/services/assistant/tools/registry";

const mockDealerFind = vi.fn();
const mockVehicleCount = vi.fn();
const mockDemandCount = vi.fn();
const mockDemandFindMany = vi.fn();
const mockOnboardingFind = vi.fn();
const mockOnboardingCreate = vi.fn();
const mockOnboardingUpdate = vi.fn();
const mockOnboardingUpsert = vi.fn();
const mockPushCount = vi.fn();
const mockRevealCount = vi.fn();
const mockNotificationFind = vi.fn();
const mockDealerCount = vi.fn();
const mockCandidateMatchCount = vi.fn();
const mockBuyerInterestCount = vi.fn();
const mockSellerOpportunityCount = vi.fn();
const mockSellerInterestCount = vi.fn();
const mockOutcomeCount = vi.fn();
const mockValidationCount = vi.fn();
const mockAiLogCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealer: {
      findUnique: (...args: unknown[]) => mockDealerFind(...args),
      count: (...args: unknown[]) => mockDealerCount(...args),
    },
    vehicle: { count: (...args: unknown[]) => mockVehicleCount(...args) },
    demand: {
      count: (...args: unknown[]) => mockDemandCount(...args),
      findMany: (...args: unknown[]) => mockDemandFindMany(...args),
    },
    dealerOnboardingState: {
      findUnique: (...args: unknown[]) => mockOnboardingFind(...args),
      create: (...args: unknown[]) => mockOnboardingCreate(...args),
      update: (...args: unknown[]) => mockOnboardingUpdate(...args),
      upsert: (...args: unknown[]) => mockOnboardingUpsert(...args),
    },
    pushSubscription: { count: (...args: unknown[]) => mockPushCount(...args) },
    reveal: { count: (...args: unknown[]) => mockRevealCount(...args) },
    notification: { findFirst: (...args: unknown[]) => mockNotificationFind(...args) },
    candidateMatch: { count: (...args: unknown[]) => mockCandidateMatchCount(...args) },
    buyerInterest: { count: (...args: unknown[]) => mockBuyerInterestCount(...args) },
    sellerOpportunity: { count: (...args: unknown[]) => mockSellerOpportunityCount(...args) },
    sellerInterest: { count: (...args: unknown[]) => mockSellerInterestCount(...args) },
    outcome: { count: (...args: unknown[]) => mockOutcomeCount(...args) },
    validationEvent: { count: (...args: unknown[]) => mockValidationCount(...args) },
    aiOperationLog: { count: (...args: unknown[]) => mockAiLogCount(...args) },
  },
}));

const mockNotifyDealerUsers = vi.fn();
vi.mock("@/services/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/notifications")>();
  return {
    ...actual,
    notifyDealerUsers: (...args: unknown[]) => mockNotifyDealerUsers(...args),
  };
});

import { getDealerSetupStatus, markOnboardingStep } from "@/services/dealer/onboarding-state";
import { getAdminAttentionItems, getAdminFunnelMetrics } from "@/services/admin/control-center";
import { notifyExpiringDemands } from "@/services/notifications/product-events";

describe("Dealer onboarding state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDealerFind.mockResolvedValue({
      city: "תל אביב",
      region: "מרכז",
      phone: "050",
      businessName: "Test Motors",
    });
    mockVehicleCount.mockResolvedValue(0);
    mockDemandCount.mockResolvedValue(0);
    mockPushCount.mockResolvedValue(0);
    mockOnboardingFind.mockResolvedValue(null);
    mockOnboardingCreate.mockImplementation(({ data }) => ({ ...data, dealerId: "d1" }));
  });

  it("shows onboarding for new dealer without inventory or demand", async () => {
    const status = await getDealerSetupStatus("d1");
    expect(status.shouldShowOnboarding).toBe(true);
    expect(status.hasInventory).toBe(false);
  });

  it("auto-completes onboarding for dealer with existing inventory", async () => {
    mockVehicleCount.mockResolvedValue(3);
    mockOnboardingCreate.mockResolvedValue({
      dealerId: "d1",
      completedAt: new Date(),
    });
    const status = await getDealerSetupStatus("d1");
    expect(status.shouldShowOnboarding).toBe(false);
    expect(mockOnboardingCreate).toHaveBeenCalled();
  });

  it("skips onboarding when dismissed", async () => {
    mockOnboardingFind.mockResolvedValue({
      dismissedAt: new Date(),
      completedAt: null,
    });
    const status = await getDealerSetupStatus("d1");
    expect(status.shouldShowOnboarding).toBe(false);
  });

  it("marks complete step persistently", async () => {
    mockOnboardingUpsert.mockResolvedValue({ completedAt: new Date() });
    await markOnboardingStep("d1", "complete");
    expect(mockOnboardingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dealerId: "d1" },
        update: expect.objectContaining({ completedAt: expect.any(Date) }),
      })
    );
  });
});

describe("Admin funnel metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCandidateMatchCount.mockResolvedValue(10);
    mockBuyerInterestCount.mockResolvedValue(4);
    mockSellerOpportunityCount.mockResolvedValue(3);
    mockSellerInterestCount.mockResolvedValue(2);
    mockRevealCount.mockResolvedValue(1);
    mockOutcomeCount.mockResolvedValue(0);
  });

  it("returns null revealToDealPct when no reveals", async () => {
    mockRevealCount.mockResolvedValue(0);
    const funnel = await getAdminFunnelMetrics(7);
    expect(funnel.revealToDealPct).toBeNull();
    expect(funnel.period).toBe("7d");
  });

  it("calculates revealToDealPct only when reveals > 0", async () => {
    mockRevealCount.mockResolvedValue(4);
    mockOutcomeCount.mockResolvedValue(1);
    const funnel = await getAdminFunnelMetrics(7);
    expect(funnel.revealToDealPct).toBe(25);
  });
});

describe("Admin attention queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDealerCount.mockResolvedValue(0);
    mockValidationCount.mockResolvedValue(0);
    mockSellerOpportunityCount.mockResolvedValue(0);
    mockRevealCount.mockResolvedValue(0);
    mockAiLogCount.mockResolvedValue(0);
  });

  it("surfaces pending dealer approvals", async () => {
    mockDealerCount.mockResolvedValueOnce(2);
    const items = await getAdminAttentionItems();
    expect(items.some((i) => i.type === "pending_approval")).toBe(true);
  });
});

describe("Push deep-link generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotificationFind.mockResolvedValue(null);
    mockDemandFindMany.mockResolvedValue([
      {
        id: "demand-1",
        confirmedJson: { make: "Mazda", model: "CX-5" },
      },
    ]);
  });

  it("uses entity-specific demand edit link for expiring demands", async () => {
    await notifyExpiringDemands("d1");
    expect(mockNotifyDealerUsers).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({
        link: "/demand?edit=demand-1",
        entityType: "demand",
        entityId: "demand-1",
      })
    );
  });
});

describe("Agent 2.3 product extensions", () => {
  it("registers reveal read tools", () => {
    expect(ALL_READ_TOOLS).toContain("getMyReveals");
    expect(ALL_READ_TOOLS).toContain("getMyPendingOutcomes");
  });
});
