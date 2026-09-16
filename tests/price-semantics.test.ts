import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("price semantics remain independent", () => {
  it("create/update vehicle do not collapse dealer and retail prices", () => {
    const create = readSrc("src/services/inventory/create-vehicle.ts");
    const update = readSrc("src/services/inventory/update-vehicle.ts");
    expect(create).toContain("retailPrice: mapped.retailPrice");
    expect(create).toContain("b2bPrice: mapped.b2bPrice");
    expect(create).not.toMatch(/askingPrice/);
    expect(create).not.toMatch(/retailPrice:\s*(f|mapped|vehicle)\.b2bPrice/);
    expect(create).not.toMatch(/b2bPrice:\s*(f|mapped|vehicle)\.retailPrice/);
    expect(update).toContain('if ("retailPrice" in f) data.retailPrice = f.retailPrice');
    expect(update).toContain('if ("b2bPrice" in f) data.b2bPrice = f.b2bPrice');
  });

  it("dealer UI labels the two prices in Hebrew", () => {
    const ui = readSrc("src/components/inventory/inventory-page-client.tsx");
    expect(ui).toContain('["b2bPrice", "מחיר לסוחר"]');
    expect(ui).toContain('["retailPrice", "מחיר ללקוח"]');
  });

  it("matching continues to use dealer/network price", () => {
    const matching = readSrc("src/services/domain/matching-flow.ts");
    expect(matching).toContain("vehicle.b2bPrice");
  });
});
