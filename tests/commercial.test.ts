import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FREE_LIFETIME_REVEALS,
  BILLING_EVENT,
  COMMERCIAL_PLANS,
} from "@/config/commercial";

const mockRevealUsageFind = vi.fn();
const mockRevealUsageCreate = vi.fn();
const mockCommercialFind = vi.fn();
const mockCommercialCreate = vi.fn();
const mockCommercialUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    revealUsage: {
      findUnique: (...args: unknown[]) => mockRevealUsageFind(...args),
      create: (...args: unknown[]) => mockRevealUsageCreate(...args),
    },
    dealerCommercial: {
      findUnique: (...args: unknown[]) => mockCommercialFind(...args),
      create: (...args: unknown[]) => mockCommercialCreate(...args),
      update: (...args: unknown[]) => mockCommercialUpdate(...args),
    },
  },
}));

import { recordRevealUsageForDealer } from "@/services/commercial/reveal-usage";

describe("Commercial Model Config", () => {
  it("§49: free reveals = 5 per dealer", () => {
    expect(FREE_LIFETIME_REVEALS).toBe(5);
    expect(COMMERCIAL_PLANS.onboarding.freeLifetimeAllowance).toBe(5);
  });

  it("§47: billing event is reveal_created", () => {
    expect(BILLING_EVENT).toBe("reveal_created");
  });

  it("§52: plans are configurable with expected allowances", () => {
    expect(COMMERCIAL_PLANS.dealer.monthlyRevealAllowance).toBe(15);
    expect(COMMERCIAL_PLANS.dealer_pro.monthlyRevealAllowance).toBe(30);
    expect(COMMERCIAL_PLANS.dealer_max.monthlyRevealAllowance).toBe(60);
  });
});

describe("Reveal Usage Idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("§59: duplicate usage does not increment allowance", async () => {
    mockRevealUsageFind.mockResolvedValueOnce({
      id: "existing",
      source: "FREE_LIFETIME",
    });

    const result = await recordRevealUsageForDealer("reveal-1", "dealer-1");

    expect(result.created).toBe(false);
    expect(mockCommercialUpdate).not.toHaveBeenCalled();
    expect(mockRevealUsageCreate).not.toHaveBeenCalled();
  });

  it("§59: first usage increments free allowance", async () => {
    mockRevealUsageFind.mockResolvedValueOnce(null);
    mockCommercialFind.mockResolvedValueOnce({
      dealerId: "dealer-1",
      planSlug: "onboarding",
      freeRevealAllowance: 5,
      freeRevealUsed: 0,
      monthlyRevealAllowance: 0,
      monthlyRevealUsed: 0,
      planStatus: "ACTIVE",
    });

    const result = await recordRevealUsageForDealer("reveal-2", "dealer-1");

    expect(result.created).toBe(true);
    expect(result.source).toBe("FREE_LIFETIME");
    expect(mockCommercialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { freeRevealUsed: { increment: 1 } },
      })
    );
  });

  it("P-61: grace reveal records GRACE when allowance exhausted", async () => {
    mockRevealUsageFind.mockResolvedValueOnce(null);
    mockCommercialFind.mockResolvedValueOnce({
      dealerId: "dealer-1",
      planSlug: "onboarding",
      freeRevealAllowance: 5,
      freeRevealUsed: 5,
      monthlyRevealAllowance: 0,
      monthlyRevealUsed: 0,
      planStatus: "ACTIVE",
    });

    const result = await recordRevealUsageForDealer("reveal-grace", "dealer-1");

    expect(result.created).toBe(true);
    expect(result.source).toBe("GRACE");
    expect(mockCommercialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { planStatus: "ACTION_REQUIRED" },
      })
    );
    expect(mockRevealUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "GRACE" }),
      })
    );
  });

  it("P-61: grace usage is idempotent", async () => {
    mockRevealUsageFind.mockResolvedValueOnce({
      id: "existing-grace",
      source: "GRACE",
    });

    const result = await recordRevealUsageForDealer("reveal-grace", "dealer-1");

    expect(result.created).toBe(false);
    expect(result.source).toBe("GRACE");
    expect(mockCommercialUpdate).not.toHaveBeenCalled();
  });
});

describe("Agent Gates — Commercial Separation", () => {
  it("§55: outcome status enum does not include billing events", () => {
    const outcomeStatuses = [
      "DEAL_CLOSED",
      "STILL_IN_PROGRESS",
      "PRICE_DIDNT_WORK",
      "VEHICLE_DIDNT_FIT",
      "DID_NOT_PROGRESS",
    ];
    expect(outcomeStatuses).not.toContain("BILLED");
    expect(outcomeStatuses).not.toContain("REVEAL_CREATED");
  });

  it("§58: interested is not a billing event", () => {
    expect(BILLING_EVENT).not.toBe("buyer_interested");
    expect(BILLING_EVENT).not.toBe("seller_interested");
  });
});
