import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mapHeaders, parseRow, parseNumber } from "@/services/inventory/column-mapper";

const root = join(__dirname, "..");

describe("Inventory column mapper", () => {
  it("maps Hebrew and English headers", () => {
    const headers = ["יצרן", "דגם", "שנה", "km", "מחיר B2B"];
    const mapping = mapHeaders(headers);
    expect(mapping.make).toBe(0);
    expect(mapping.model).toBe(1);
    expect(mapping.year).toBe(2);
    expect(mapping.mileage).toBe(3);
    expect(mapping.b2bPrice).toBe(4);
  });

  it("parses numeric values with commas", () => {
    expect(parseNumber("134,000")).toBe(134000);
    expect(parseNumber("61K")).toBe(null);
    expect(parseNumber(2023)).toBe(2023);
  });

  it("parses row into vehicle fields", () => {
    const mapping = mapHeaders(["make", "model", "year", "mileage"]);
    const fields = parseRow(["Mazda", "CX-5", 2023, 61000], mapping);
    expect(fields.make).toBe("Mazda");
    expect(fields.model).toBe("CX-5");
    expect(fields.year).toBe(2023);
    expect(fields.mileage).toBe(61000);
  });
});

describe("import confirm uses shared domain mutation path", () => {
  const createVehicleForDealer = vi.fn();
  const updateVehicleForDealer = vi.fn();
  const markVehicleSoldForDealer = vi.fn();
  const logAppEvent = vi.fn();
  const findFirstImport = vi.fn();
  const updateImport = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    createVehicleForDealer.mockReset();
    updateVehicleForDealer.mockReset();
    markVehicleSoldForDealer.mockReset();
    logAppEvent.mockReset();
    findFirstImport.mockReset();
    updateImport.mockReset();

    vi.doMock("@/services/inventory/create-vehicle", () => ({
      createVehicleForDealer,
    }));
    vi.doMock("@/services/inventory/update-vehicle", () => ({
      updateVehicleForDealer,
    }));
    vi.doMock("@/services/inventory/mark-sold", () => ({
      markVehicleSoldForDealer,
    }));
    vi.doMock("@/services/notifications", () => ({
      logAppEvent,
    }));
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        inventoryImport: {
          findFirst: findFirstImport,
          update: updateImport,
        },
        vehicle: {
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    }));
    vi.doMock("@/lib/prisma-json", () => ({
      toPrismaJson: (v: unknown) => v,
    }));
  });

  it("routes create/update/sold through domain services and skips foreign vehicle", async () => {
    findFirstImport.mockResolvedValue({
      id: "imp1",
      dealerId: "d1",
      status: "PREVIEW",
      previewJson: {
        rows: [
          {
            rowIndex: 2,
            skip: false,
            duplicateOfVehicleId: null,
            duplicateConfidence: null,
            fields: {
              make: "Mazda",
              model: "CX-5",
              year: 2023,
              mileage: 61000,
              trim: null,
              color: null,
              b2bPrice: 134000,
              retailPrice: null,
              region: null,
              ownershipHand: null,
              dealerRefId: "R1",
              vin: null,
              licensePlate: null,
            },
          },
          {
            rowIndex: 3,
            skip: false,
            duplicateOfVehicleId: "v-existing",
            duplicateConfidence: "high",
            fields: {
              make: "Toyota",
              model: "Corolla",
              year: 2022,
              mileage: 62000,
              trim: null,
              color: null,
              b2bPrice: 129000,
              retailPrice: null,
              region: null,
              ownershipHand: null,
              dealerRefId: null,
              vin: null,
              licensePlate: null,
            },
          },
          {
            rowIndex: 4,
            skip: false,
            duplicateOfVehicleId: "v-foreign",
            duplicateConfidence: "high",
            fields: {
              make: "Other",
              model: "Car",
              year: 2020,
              mileage: null,
              trim: null,
              color: null,
              b2bPrice: null,
              retailPrice: null,
              region: null,
              ownershipHand: null,
              dealerRefId: null,
              vin: null,
              licensePlate: null,
            },
          },
        ],
        diff: {
          missingFromFile: [{ vehicleId: "v-missing" }],
        },
      },
    });
    updateImport.mockResolvedValue({});

    createVehicleForDealer.mockResolvedValue({
      ok: true,
      vehicle: { id: "v-new" },
    });
    updateVehicleForDealer.mockImplementation(async (input: { vehicleId: string }) => {
      if (input.vehicleId === "v-foreign") {
        return { ok: false, error: "not_found" };
      }
      return { ok: true, vehicle: { id: input.vehicleId } };
    });
    markVehicleSoldForDealer.mockResolvedValue({
      ok: true,
      vehicle: { id: "v-missing" },
      alreadySold: false,
    });

    const { confirmImport } = await import("@/services/inventory/import");
    const result = await confirmImport({
      dealerId: "d1",
      importId: "imp1",
      markMissingAsSold: true,
    });

    expect(createVehicleForDealer).toHaveBeenCalledTimes(1);
    expect(createVehicleForDealer).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: "d1",
        source: "import",
        requireIdentity: false,
        rawInput: "ref:R1",
        fields: expect.objectContaining({
          make: "Mazda",
          model: "CX-5",
          year: 2023,
        }),
      })
    );

    expect(updateVehicleForDealer).toHaveBeenCalledTimes(2);
    expect(updateVehicleForDealer).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: "d1",
        vehicleId: "v-existing",
        source: "import",
        skipEventLog: true,
        fields: expect.objectContaining({
          b2bPrice: 129000,
          make: "Toyota",
        }),
      })
    );

    expect(markVehicleSoldForDealer).toHaveBeenCalledWith(
      expect.objectContaining({
        dealerId: "d1",
        vehicleId: "v-missing",
        source: "import_diff",
      })
    );

    // Foreign ownership failure must not count as updated
    expect(result).toEqual({ created: 1, updated: 1 });
    expect(logAppEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "inventory_imported",
        dealerId: "d1",
        metadata: { created: 1, updated: 1 },
      })
    );
  });

  it("preserves skip / invalid row behavior (no create for skipped)", async () => {
    findFirstImport.mockResolvedValue({
      id: "imp2",
      dealerId: "d1",
      status: "PREVIEW",
      previewJson: {
        rows: [
          {
            rowIndex: 2,
            skip: true,
            duplicateOfVehicleId: null,
            duplicateConfidence: null,
            fields: {
              make: null,
              model: null,
              year: null,
              mileage: null,
              trim: null,
              color: null,
              b2bPrice: null,
              retailPrice: null,
              region: null,
              ownershipHand: null,
              dealerRefId: null,
              vin: null,
              licensePlate: null,
            },
          },
        ],
        diff: { missingFromFile: [] },
      },
    });
    updateImport.mockResolvedValue({});

    const { confirmImport } = await import("@/services/inventory/import");
    const result = await confirmImport({
      dealerId: "d1",
      importId: "imp2",
    });

    expect(createVehicleForDealer).not.toHaveBeenCalled();
    expect(updateVehicleForDealer).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0 });
  });

  it("does not call prisma.vehicle.create/update inside import.ts", () => {
    const src = readFileSync(
      join(root, "src/services/inventory/import.ts"),
      "utf8"
    );
    expect(src).toContain("createVehicleForDealer");
    expect(src).toContain("updateVehicleForDealer");
    expect(src).toContain("markVehicleSoldForDealer");
    expect(src).not.toMatch(/prisma\.vehicle\.(create|update|upsert|updateMany)\s*\(/);
  });
});

describe("domain services support import batch options", () => {
  it("createVehicleForDealer accepts requireIdentity false and import source", () => {
    const src = readFileSync(
      join(root, "src/services/inventory/create-vehicle.ts"),
      "utf8"
    );
    expect(src).toContain("requireIdentity");
    expect(src).toContain("lastAvailabilityConfirmedAt");
    expect(src).toContain('InventoryMutationSource');
  });

  it("updateVehicleForDealer supports skipEventLog and rawInput", () => {
    const src = readFileSync(
      join(root, "src/services/inventory/update-vehicle.ts"),
      "utf8"
    );
    expect(src).toContain("skipEventLog");
    expect(src).toContain("rawInput");
    expect(src).toContain("lastAvailabilityConfirmedAt");
  });
});
