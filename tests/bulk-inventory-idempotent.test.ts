import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockRemove = vi.fn();
const mockSold = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: vi.fn().mockResolvedValue(1),
    },
    sellerOpportunity: { groupBy: vi.fn().mockResolvedValue([]) },
    validationEvent: { groupBy: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/services/inventory/remove-from-inventory", () => ({
  removeVehicleFromInventoryForDealer: (...args: unknown[]) => mockRemove(...args),
}));

vi.mock("@/services/inventory/mark-sold", () => ({
  markVehicleSoldForDealer: (...args: unknown[]) => mockSold(...args),
}));

import { runBulkInventoryMutation } from "@/services/inventory/bulk-inventory";

describe("bulk inventory archive idempotent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts already archived without calling remove again", async () => {
    mockFindMany.mockResolvedValue([{ id: "v1" }]);
    mockFindFirst.mockResolvedValue({ id: "v1", status: "ARCHIVED" });

    const result = await runBulkInventoryMutation({
      dealerId: "d1",
      action: "archive",
      vehicleIds: ["v1"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyInTargetStateCount).toBe(1);
    expect(result.affectedCount).toBe(0);
    expect(result.processedCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("does not archive SOLD vehicles", async () => {
    mockFindMany.mockResolvedValue([{ id: "v2" }]);
    mockFindFirst.mockResolvedValue({ id: "v2", status: "SOLD" });

    const result = await runBulkInventoryMutation({
      dealerId: "d1",
      action: "archive",
      vehicleIds: ["v2"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.failures[0]?.error).toBe("sold_not_archivable");
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
