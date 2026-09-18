import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMock = vi.hoisted(() => ({
  vehicleCandidate: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  intakeMedia: { update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/services/identity/gov-vehicle", () => ({
  lookupVehicleByPlate: vi.fn(async () => ({
    state: "FOUND",
    identity: { make: "Kia", model: "Picanto", year: 2020 },
  })),
}));

const commitMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/intake/commit", () => ({
  commitOneCandidate: (...args: unknown[]) => commitMock(...args),
}));

vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: vi.fn(async () => undefined),
}));

import { resolveIntakeCandidate } from "@/services/intake/review";

describe("resolveIntakeCandidate — no auto commit", () => {
  beforeEach(() => {
    commitMock.mockReset();
    prismaMock.vehicleCandidate.findFirst.mockReset();
    prismaMock.vehicleCandidate.update.mockReset();
  });

  it("plate confirm without commit flags does not create Vehicle", async () => {
    const baseCandidate = {
      id: "c1",
      batchId: "b1",
      dealerId: "d1",
      status: "NEEDS_INFO",
      plateNormalized: null,
      fieldProvenance: {},
      commercialJson: {},
      media: [],
    };
    const refreshed = {
      id: "c1",
      batchId: "b1",
      status: "READY",
      reviewStatus: "NONE",
      detectedPlate: "12-345-67",
      plateNormalized: "1234567",
      govState: "FOUND",
      govIdentityJson: {},
      commercialJson: {},
      missingFields: [],
      existingVehicleId: null,
      confidenceBand: null,
      batch: {},
      media: [],
    };
    prismaMock.vehicleCandidate.findFirst
      .mockResolvedValueOnce(baseCandidate)
      .mockResolvedValueOnce(baseCandidate)
      .mockResolvedValueOnce(refreshed);

    const result = await resolveIntakeCandidate({
      dealerId: "d1",
      candidateId: "c1",
      detectedPlate: "12-345-67",
    });

    expect(commitMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok && "candidate" in result) {
      expect(result.candidate?.status).toBe("READY");
      expect(result).not.toHaveProperty("vehicleId");
    }
  });

  it("GOV refresh returns candidate until explicit commit intent", async () => {
    prismaMock.vehicleCandidate.findFirst
      .mockResolvedValueOnce({
        id: "c2",
        batchId: "b1",
        dealerId: "d1",
        status: "READY",
        plateNormalized: "7654321",
        fieldProvenance: {},
        commercialJson: {},
        media: [],
      })
      .mockResolvedValueOnce({
        id: "c2",
        batchId: "b1",
        status: "READY",
        reviewStatus: "NONE",
        detectedPlate: "7654321",
        plateNormalized: "7654321",
        govState: "FOUND",
        govIdentityJson: { make: "Kia" },
        commercialJson: {},
        missingFields: [],
        existingVehicleId: null,
        confidenceBand: null,
        batch: {},
        media: [],
      });

    const result = await resolveIntakeCandidate({
      dealerId: "d1",
      candidateId: "c2",
    });

    expect(commitMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});
