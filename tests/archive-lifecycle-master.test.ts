import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("archive lifecycle ≠ sold lifecycle", () => {
  it("remove-from-inventory uses archive lifecycle only", () => {
    const remove = read("src/services/inventory/remove-from-inventory.ts");
    expect(remove).toContain("applyVehicleArchiveLifecycle");
    expect(remove).not.toContain("applyVehicleSoldLifecycle");
  });

  it("archive lifecycle emits inventory_removed / unavailable — not sold", () => {
    const archive = read("src/services/inventory/archive-lifecycle.ts");
    expect(archive).toContain('reason: "inventory_removed"');
    expect(archive).toContain('response: "unavailable"');
    expect(archive).not.toContain("vehicle_sold");
    expect(archive).not.toContain('response: "sold"');
  });

  it("sold lifecycle keeps vehicle_sold semantics", () => {
    const sold = read("src/services/inventory/sold-lifecycle.ts");
    expect(sold).toContain('reason: "vehicle_sold"');
    expect(sold).toContain('response: "sold"');
  });

  it("mark-sold still uses sold lifecycle", () => {
    const mark = read("src/services/inventory/mark-sold.ts");
    expect(mark).toContain("applyVehicleSoldLifecycle");
    expect(mark).not.toContain("applyVehicleArchiveLifecycle");
  });
});
