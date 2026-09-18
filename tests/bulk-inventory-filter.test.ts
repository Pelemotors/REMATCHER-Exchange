import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildDealerInventoryWhere,
  fetchAllMatchingVehicleIds,
} from "@/services/inventory/dealer-inventory-filter";

const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vehicle: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    sellerOpportunity: { groupBy: vi.fn().mockResolvedValue([]) },
    validationEvent: { groupBy: vi.fn().mockResolvedValue([]) },
  },
}));

describe("bulk inventory filter selectAllMatching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("pages through all ids without take:500 cap", async () => {
    mockCount.mockResolvedValue(3);
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }]);

    const { ids, totalMatchingCount } = await fetchAllMatchingVehicleIds({
      dealerId: "d1",
      filter: "active",
    });

    expect(totalMatchingCount).toBe(3);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, skip: 0 })
    );
  });

  it("fails explicitly when over bulk ops limit", async () => {
    vi.stubEnv("INVENTORY_BULK_MAX_OPS", "2");
    mockCount.mockResolvedValue(5);
    mockFindMany.mockResolvedValueOnce([]);
    await expect(
      fetchAllMatchingVehicleIds({ dealerId: "d1", filter: "sold" })
    ).rejects.toThrow("bulk_ops_limit_exceeded");
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("attention filter uses aux ids in where", () => {
    const where = buildDealerInventoryWhere({
      dealerId: "d",
      filter: "attention",
      aux: { attentionIds: new Set(["x"]), interestVehicleIds: [] },
    });
    expect(where).toMatchObject({ id: { in: ["x"] } });
  });
});
