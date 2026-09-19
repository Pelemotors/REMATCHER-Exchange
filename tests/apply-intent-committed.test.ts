import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCandidateFind = vi.fn();
const mockVehicleFind = vi.fn();
const mockCandidateUpdate = vi.fn();
const mockSetRelationship = vi.fn();
const mockConvert = vi.fn();

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

import { applyCandidateIntent } from "@/services/intake/apply-intent";

describe("committed intake intent uses canonical services", () => {
  beforeEach(() => {
    mockCandidateFind.mockReset();
    mockVehicleFind.mockReset();
    mockCandidateUpdate.mockReset();
    mockSetRelationship.mockReset();
    mockConvert.mockReset();
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

  it("routes non-owned committed change through setVehicleRelationship", async () => {
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
    mockSetRelationship.mockResolvedValue({ ok: true, vehicle: { id: "v1" } });
    const result = await applyCandidateIntent({
      dealerId: "d1",
      candidateId: "c1",
      intent: "TRADE_IN_CANDIDATE",
    });
    expect(result.ok).toBe(true);
    expect(mockSetRelationship).toHaveBeenCalledWith({
      dealerId: "d1",
      vehicleId: "v1",
      relationship: "TRADE_IN_CANDIDATE",
    });
    expect(mockConvert).not.toHaveBeenCalled();
  });
});
