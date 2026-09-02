import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDemandFind = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demand: {
      findMany: (...args: unknown[]) => mockDemandFind(...args),
      count: vi.fn().mockResolvedValue(0),
    },
    candidateMatch: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    buyerInterest: { count: vi.fn().mockResolvedValue(0) },
    sellerInterest: { count: vi.fn().mockResolvedValue(0) },
    reveal: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    outcome: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    mutualInterest: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    appEvent: { groupBy: vi.fn().mockResolvedValue([]) },
    pushCampaign: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          selectedCount: 0,
          eligibleCount: 0,
          sentCount: 0,
          failedCount: 0,
          receivedCount: 0,
          clickedCount: 0,
          destinationOpenedCount: 0,
        },
      }),
    },
  },
}));

vi.mock("@/services/analytics/active-dealer", () => ({
  countActiveDealers: vi.fn().mockResolvedValue(0),
}));

import { getLifecycleMetrics } from "@/services/analytics/product-intelligence";

describe("lifecycle timing — no arbitrary truncation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDemandFind.mockImplementation(async (args: { take?: number }) => {
      if (args && "take" in args && args.take === 500) {
        throw new Error("unexpected take:500 truncation");
      }
      return Array.from({ length: 600 }, (_, i) => ({
        createdAt: new Date(Date.now() - i * 1000),
        candidateMatches: [{ createdAt: new Date() }],
      }));
    });
  });

  it("processes all demands in period without take:500 cap", async () => {
    const metrics = await getLifecycleMetrics(7);
    expect(mockDemandFind).toHaveBeenCalled();
    expect(metrics.demand.timeToFirstMatch.count).toBe(600);
  });
});
