import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildDealerInventoryWhere } from "@/services/inventory/dealer-inventory-filter";
import { checkCatalogPublishEligibility } from "@/services/catalog/eligibility";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));
vi.mock("@/services/exchange/events", () => ({
  emitExchangeEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/services/matching/inventory-rematch", () => ({
  rematchAfterInventoryMutation: vi.fn(),
}));
vi.mock("@/services/catalog/reconcile", () => ({
  reconcileCatalogPublicationForVehicle: vi.fn(),
}));

import {
  convertToOwnedInventory,
  publishVehicleToNetwork,
} from "@/services/vehicles/relationship-visibility";

describe("inventory owned vs review filters", () => {
  it("owned lists only OWNED/INVENTORY", () => {
    const where = buildDealerInventoryWhere({
      dealerId: "d1",
      filter: "owned",
    });
    expect(where.status).toBe("ACTIVE");
    expect(where.dealerRelationship).toEqual({ in: ["OWNED", "INVENTORY"] });
  });

  it("review lists only offered/trade", () => {
    const where = buildDealerInventoryWhere({
      dealerId: "d1",
      filter: "review",
    });
    expect(where.dealerRelationship).toEqual({
      in: ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE"],
    });
  });

  it("default lists never include EXTERNAL", () => {
    const where = buildDealerInventoryWhere({
      dealerId: "d1",
      filter: "active",
    });
    expect(where.dealerRelationship).toEqual({ not: "EXTERNAL" });
  });
});

describe("convertToOwnedInventory", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
  });

  it("converts OFFERED_TO_ME on the same vehicle", async () => {
    mockFindFirst.mockResolvedValue({
      id: "v1",
      dealerId: "d1",
      dealerRelationship: "OFFERED_TO_ME",
      visibility: "PRIVATE",
    });
    mockUpdate.mockResolvedValue({
      id: "v1",
      dealerRelationship: "OWNED",
      visibility: "PRIVATE",
    });
    const result = await convertToOwnedInventory({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vehicle.id).toBe("v1");
      expect("idempotent" in result && result.idempotent).toBe(false);
    }
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dealerRelationship: "OWNED" }),
      })
    );
  });

  it("converts TRADE_IN_CANDIDATE without creating a second vehicle", async () => {
    mockFindFirst.mockResolvedValue({
      id: "v9",
      dealerId: "d1",
      dealerRelationship: "TRADE_IN_CANDIDATE",
      visibility: "PRIVATE",
    });
    mockUpdate.mockResolvedValue({
      id: "v9",
      dealerRelationship: "OWNED",
    });
    const result = await convertToOwnedInventory({
      dealerId: "d1",
      vehicleId: "v9",
    });
    expect(result.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when already OWNED", async () => {
    const owned = {
      id: "v1",
      dealerId: "d1",
      dealerRelationship: "OWNED",
      visibility: "PRIVATE",
    };
    mockFindFirst.mockResolvedValue(owned);
    const result = await convertToOwnedInventory({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects wrong dealer", async () => {
    mockFindFirst.mockResolvedValue(null);
    const result = await convertToOwnedInventory({
      dealerId: "other",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_found");
  });

  it("rejects EXTERNAL", async () => {
    mockFindFirst.mockResolvedValue({
      id: "v1",
      dealerId: "d1",
      dealerRelationship: "EXTERNAL",
    });
    const result = await convertToOwnedInventory({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("relationship_not_convertible");
  });
});

describe("illegal ownership actions", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
  });

  it("rejects OFFERED_TO_ME publish to network", async () => {
    mockFindFirst.mockResolvedValue({
      id: "v1",
      dealerId: "d1",
      dealerRelationship: "OFFERED_TO_ME",
      status: "ACTIVE",
      mediaReady: true,
    });
    const result = await publishVehicleToNetwork({
      dealerId: "d1",
      vehicleId: "v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("relationship_not_publishable");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects TRADE_IN_CANDIDATE catalog publish", () => {
    const result = checkCatalogPublishEligibility(
      {
        status: "ACTIVE",
        dealerRelationship: "TRADE_IN_CANDIDATE",
        dealerId: "d1",
      },
      "d1"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("relationship_not_publishable");
  });

  it("rejects EXTERNAL share-as-owned at catalog eligibility", () => {
    const result = checkCatalogPublishEligibility(
      {
        status: "ACTIVE",
        dealerRelationship: "EXTERNAL",
        dealerId: "d1",
      },
      "d1"
    );
    expect(result.ok).toBe(false);
  });

  it("sharing service uses catalog-eligible relationships only", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/sharing/sharing-service.ts"),
      "utf8"
    );
    expect(src).toContain("CATALOG_ELIGIBLE_RELATIONSHIPS");
    expect(src).toContain("not_shareable");
  });

  it("mark-sold consults vehicleCapabilities", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/inventory/mark-sold.ts"),
      "utf8"
    );
    expect(src).toContain("vehicleCapabilities");
    expect(src).toContain("ownership_required");
  });
});
