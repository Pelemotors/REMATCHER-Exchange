import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reveal: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { getRevealForDealer } from "@/services/commercial/reveal-flow";

describe("Reveal Authorization", () => {
  it("denies access when dealer is not part of reveal", async () => {
    vi.mocked(prisma.reveal.findFirst).mockResolvedValueOnce(null);

    await expect(getRevealForDealer("reveal-x", "dealer-a")).rejects.toThrow(
      "FORBIDDEN"
    );
  });

  it("allows access when dealer belongs to reveal", async () => {
    vi.mocked(prisma.reveal.findFirst).mockResolvedValueOnce({
      id: "reveal-x",
      buyerDealerId: "dealer-a",
      sellerDealerId: "dealer-b",
      revealedAt: new Date(),
      sellerContactJson: { phone: "050" },
      buyerContactJson: { phone: "051" },
      matchSummaryJson: null,
      outcome: null,
      usages: [{ dealerId: "dealer-a" }],
      mutualInterest: {
        sellerInterest: {
          opportunity: {
            candidateMatch: {
              vehicle: {},
              demand: {},
            },
          },
        },
      },
    } as never);

    const result = await getRevealForDealer("reveal-x", "dealer-a");
    expect(result.isBuyer).toBe(true);
    expect(result.counterparty).toEqual({ phone: "050" });
  });
});
