import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewAskingPriceFromCommercial } from "@/services/vehicles/review-asking-price";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockVehicleUpdate = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockVehicleUpdate(...args),
    },
    vehicleCandidate: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    vehicleDecision: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock("@/services/inventory/update-vehicle", () => ({
  updateVehicleForDealer: vi.fn(async (input: { vehicleId: string }) => ({
    ok: true,
    vehicle: { id: input.vehicleId, status: "ARCHIVED" },
  })),
}));
vi.mock("@/services/inventory/archive-lifecycle", () => ({
  applyVehicleArchiveLifecycle: vi.fn(),
}));
vi.mock("@/services/catalog/reconcile", () => ({
  reconcileCatalogPublicationForVehicle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: vi.fn(),
}));

import { removeVehicleFromInventoryForDealer } from "@/services/inventory/remove-from-inventory";
import { markVehicleSoldForDealer } from "@/services/inventory/mark-sold";

describe("bulk filter schema", () => {
  it("accepts owned and review", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/v1/inventory/bulk/route.ts"),
      "utf8"
    );
    expect(src).toContain('"owned"');
    expect(src).toContain('"review"');
  });
});

describe("archive authority", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
    mockVehicleUpdate.mockReset();
  });

  it("OWNED can archive", async () => {
    mockFindFirst.mockResolvedValue({
      dealerRelationship: "OWNED",
      status: "ACTIVE",
    });
    const result = await removeVehicleFromInventoryForDealer({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(true);
  });

  it("OFFERED_TO_ME archive is rejected", async () => {
    mockFindFirst.mockResolvedValue({
      dealerRelationship: "OFFERED_TO_ME",
      status: "ACTIVE",
    });
    const result = await removeVehicleFromInventoryForDealer({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ownership_required");
  });

  it("TRADE_IN_CANDIDATE archive is rejected", async () => {
    mockFindFirst.mockResolvedValue({
      dealerRelationship: "TRADE_IN_CANDIDATE",
      status: "ACTIVE",
    });
    const result = await removeVehicleFromInventoryForDealer({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ownership_required");
  });
});

describe("sold authority", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("OFFERED_TO_ME sold is rejected", async () => {
    mockFindFirst.mockResolvedValue({
      id: "v1",
      dealerId: "d1",
      status: "ACTIVE",
      dealerRelationship: "OFFERED_TO_ME",
    });
    const result = await markVehicleSoldForDealer({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ownership_required");
  });

  it("TRADE_IN_CANDIDATE sold is rejected", async () => {
    mockFindFirst.mockResolvedValue({
      id: "v1",
      dealerId: "d1",
      status: "ACTIVE",
      dealerRelationship: "TRADE_IN_CANDIDATE",
    });
    const result = await markVehicleSoldForDealer({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("ownership_required");
  });
});

describe("committed intent mutation authority", () => {
  it("does not direct-update relationship after commit", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/intake/apply-intent.ts"),
      "utf8"
    );
    expect(src).toContain("setVehicleRelationship");
    expect(src).toContain("use_convert_owned");
    expect(src).toContain("isReviewRelationship");
    expect(src).not.toMatch(
      /COMMITTED[\s\S]{0,400}prisma\.vehicle\.update\(\{\s*where: \{ id: candidate\.committedVehicleId \},\s*data: \{ dealerRelationship/
    );
  });
});

describe("persist review asking price", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
  });

  it("writes offered/asking onto the committed candidate only", async () => {
    const { persistReviewAskingPrice } = await import(
      "@/services/vehicles/review-asking-price"
    );
    mockFindFirst.mockResolvedValue({
      id: "c1",
      commercialJson: { make: "Toyota" },
    });
    mockUpdate.mockResolvedValue({});
    const saved = await persistReviewAskingPrice({
      dealerId: "d1",
      vehicleId: "v1",
      price: 90000,
    });
    expect(saved).toBe(90000);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
      })
    );
  });
});

describe("review asking price authority", () => {
  it("reads offered/asking from commercialJson only", () => {
    expect(
      reviewAskingPriceFromCommercial({ offeredPrice: 90000, retailPrice: 1 })
    ).toBe(90000);
    expect(reviewAskingPriceFromCommercial({ askingPrice: 75000 })).toBe(75000);
    expect(reviewAskingPriceFromCommercial({ b2bPrice: 120000 })).toBeNull();
    expect(reviewAskingPriceFromCommercial(null)).toBeNull();
  });

  it("intelligence engine reuses persisted review price", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/exchange-intelligence/engine.ts"),
      "utf8"
    );
    expect(src).toContain("loadReviewAskingPriceForVehicle");
    expect(src).toContain("persistReviewAskingPrice");
  });
});
