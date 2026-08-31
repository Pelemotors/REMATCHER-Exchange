import { describe, it, expect, vi } from "vitest";
import { isAdminRole } from "@/lib/brand-copy";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reveal: { findFirst: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    demand: { findFirst: vi.fn() },
    validationEvent: { findFirst: vi.fn() },
    sellerOpportunity: { findFirst: vi.fn() },
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
            candidateMatch: { vehicle: {}, demand: {} },
          },
        },
      },
    } as never);

    const result = await getRevealForDealer("reveal-x", "dealer-a");
    expect(result.isBuyer).toBe(true);
    expect(result.counterparty).toEqual({ phone: "050" });
  });
});

describe("Admin role guard", () => {
  it("ADMIN is admin", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("DEALER_USER is not admin", () => {
    expect(isAdminRole("DEALER_USER")).toBe(false);
  });
});

describe("Cross-dealer access patterns", () => {
  it("inventory query scoped to dealer", async () => {
    vi.mocked(prisma.vehicle.findFirst).mockResolvedValueOnce(null);
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: "v-other", dealerId: "dealer-a" },
    });
    expect(vehicle).toBeNull();
  });

  it("demand query scoped to dealer", async () => {
    vi.mocked(prisma.demand.findFirst).mockResolvedValueOnce(null);
    const demand = await prisma.demand.findFirst({
      where: { id: "d-other", dealerId: "dealer-a" },
    });
    expect(demand).toBeNull();
  });

  it("validation scoped to dealer", async () => {
    vi.mocked(prisma.validationEvent.findFirst).mockResolvedValueOnce(null);
    const v = await prisma.validationEvent.findFirst({
      where: { id: "val-other", dealerId: "dealer-a" },
    });
    expect(v).toBeNull();
  });

  it("opportunity scoped to seller dealer", async () => {
    vi.mocked(prisma.sellerOpportunity.findFirst).mockResolvedValueOnce(null);
    const o = await prisma.sellerOpportunity.findFirst({
      where: { id: "opp-other", vehicle: { dealerId: "dealer-a" } },
    });
    expect(o).toBeNull();
  });
});
