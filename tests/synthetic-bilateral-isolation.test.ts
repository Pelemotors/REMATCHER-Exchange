import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  marketsCompatible,
  type MarketSide,
} from "@/services/dealer/market-scope";

vi.mock("server-only", () => ({}));

const synth: MarketSide = {
  marketMode: "SYNTHETIC",
  canAccessSyntheticMarket: false,
};
const realOrdinary: MarketSide = {
  marketMode: "REAL",
  canAccessSyntheticMarket: false,
};
const realBeta: MarketSide = {
  marketMode: "REAL",
  canAccessSyntheticMarket: true,
};

describe("marketsCompatible matrix", () => {
  it("synth demand × real vehicle → incompatible", () => {
    expect(marketsCompatible(synth, realOrdinary)).toBe(false);
    expect(marketsCompatible(realOrdinary, synth)).toBe(false);
  });

  it("synth demand × synth vehicle → compatible", () => {
    expect(marketsCompatible(synth, synth)).toBe(true);
  });

  it("real ordinary × synth → incompatible", () => {
    expect(marketsCompatible(realOrdinary, synth)).toBe(false);
  });

  it("real beta × synth → compatible; synth × real beta → incompatible", () => {
    expect(marketsCompatible(realBeta, synth)).toBe(true);
    expect(marketsCompatible(synth, realBeta)).toBe(false);
  });

  it("real ordinary × real ordinary → compatible", () => {
    expect(marketsCompatible(realOrdinary, realOrdinary)).toBe(true);
  });
});

describe("rematchInventoryBatch bilateral filter", () => {
  it("filters demands with marketsCompatible against seller side", () => {
    const src = readFileSync(
      join(process.cwd(), "src/services/matching/inventory-rematch.ts"),
      "utf8"
    );
    expect(src).toContain("loadDealerMarketSide");
    expect(src).toContain("marketsCompatible");
  });
});
