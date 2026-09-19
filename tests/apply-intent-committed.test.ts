import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCandidateFind = vi.fn();
const mockVehicleFind = vi.fn();
const mockCandidateUpdate = vi.fn();
const mockSetRelationship = vi.fn();
const mockConvert = vi.fn();
const mockRetarget = vi.fn();
const mockOpenDecision = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicleCandidate: {
      findFirst: (...args: unknown[]) => mockCandidateFind(...args),
      update: (...args: unknown[]) => mockCandidateUpdate(...args),
    },
    vehicle: {
      findFirst: (...args: unknown[]) => mockVehicleFind(...args),
      update: vi.fn(),
    },
  },
}));
vi.mock("@/services/vehicles/relationship-visibility", () => ({
  setVehicleRelationship: (...args: unknown[]) => mockSetRelationship(...args),
  convertToOwnedInventory: (...args: unknown[]) => mockConvert(...args),
}));
vi.mock("@/services/intake/commit", () => ({
  commitOneCandidate: vi.fn(),
}));
vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: vi.fn(),
}));
vi.mock("@/services/intake/review", () => ({
  resolveIntakeCandidate: vi.fn(),
}));
vi.mock("@/services/decisions/vehicle-decision", () => ({
  decisionTypeForRelationship: (rel: string) =>
    rel === "OFFERED_TO_ME"
      ? "PURCHASE"
      : rel === "TRADE_IN_CANDIDATE"
        ? "TRADE"
        : null,
  openOrGetDecision: (...args: unknown[]) => mockOpenDecision(...args),
  retargetOpenDecision: (...args: unknown[]) => mockRetarget(...args),
}));
vi.mock("@/services/vehicles/review-asking-price", () => ({
  reviewAskingPriceFromCommercial: () => null,
}));

import { applyCandidateIntent } from "@/services/intake/apply-intent";

describe("committed intake intent uses canonical services", () => {
  beforeEach(() => {
    mockCandidateFind.mockReset();
    mockVehicleFind.mockReset();
    mockCandidateUpdate.mockReset();
    mockSetRelationship.mockReset();
    mockConvert.mockReset();
    mockRetarget.mockReset();
    mockOpenDecision.mockReset();
  });

  it("does not silently convert OFFERED → OWNED via intent", async () => {
    mockCandidateFind.mockResolvedValue({
      id: "c1",
      dealerId: "d1",
      status: "COMMITTED",
      committedVehicleId: "v1",
      dealerIntent: "OFFERED_TO_ME",
    });
    mockVehicleFind.mockResolvedValue({
      id: "v1",
      dealerRelationship: "OFFERED_TO_ME",
    });
    const result = await applyCandidateIntent({
      dealerId: "d1",
      candidateId: "c1",
      intent: "OWNED",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("use_convert_owned");
    expect(mockConvert).not.toHaveBeenCalled();
    expect(mockSetRelationship).not.toHaveBeenCalled();
  });

  it("routes committed PURCHASE→TRADE through retargetOpenDecision", async () => {
    mockCandidateFind.mockResolvedValue({
      id: "c1",
      dealerId: "d1",
      status: "COMMITTED",
      committedVehicleId: "v1",
      dealerIntent: "OFFERED_TO_ME",
    });
    mockVehicleFind.mockResolvedValue({
      id: "v1",
      dealerRelationship: "OFFERED_TO_ME",
    });
    mockRetarget.mockResolvedValue({
      ok: true,
      decision: { id: "dec-1", type: "TRADE", status: "OPEN" },
    });
    const result = await applyCandidateIntent({
      dealerId: "d1",
      candidateId: "c1",
      intent: "TRADE_IN_CANDIDATE",
    });
    expect(result.ok).toBe(true);
    expect(mockRetarget).toHaveBeenCalledWith({
      dealerId: "d1",
      vehicleId: "v1",
      type: "TRADE",
    });
    expect(mockSetRelationship).not.toHaveBeenCalled();
    expect(mockConvert).not.toHaveBeenCalled();
  });
});
