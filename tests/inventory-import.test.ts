import { describe, it, expect } from "vitest";
import { mapHeaders, parseRow, parseNumber } from "@/services/inventory/column-mapper";

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
