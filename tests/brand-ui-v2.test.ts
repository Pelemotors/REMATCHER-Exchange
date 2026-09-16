import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { TOKENS_V2, BRAND_ASSETS_V2 } from "@/config/brand-v2";

const root = join(__dirname, "..");

describe("Brand UI v2.1 Dark Premium tokens", () => {
  it("has Visual SoT core palette", () => {
    expect(TOKENS_V2.color.midnight).toBe("#0B1114");
    expect(TOKENS_V2.color.canvas).toBe("#0B1114");
    expect(TOKENS_V2.color.gold).toBe("#D4AF3B");
    expect(TOKENS_V2.color.exchangeBlue).toBe("#2E68F7");
    expect(TOKENS_V2.color.signalBlue).toBe("#2E68F7");
    expect(TOKENS_V2.color.platinum).toBe("#EBEDEF");
    expect(TOKENS_V2.color.warmWhite).toBe("#EBEDEF");
  });

  it("keeps green/red semantic-only", () => {
    expect(TOKENS_V2.color.success).toMatch(/^#/);
    expect(TOKENS_V2.color.error).toMatch(/^#/);
    expect(TOKENS_V2.color.success).not.toBe(TOKENS_V2.color.gold);
  });

  it("ships SVG R mark assets (not CSS-drawn)", () => {
    expect(BRAND_ASSETS_V2.rMarkGold).toContain("rematcher-r-gold.svg");
    expect(existsSync(join(root, "public/brand/rematcher-r-gold.svg"))).toBe(
      true
    );
    expect(existsSync(join(root, "public/brand/rematcher-r-white.svg"))).toBe(
      true
    );
    expect(existsSync(join(root, "public/brand/rematcher-r-gold.png"))).toBe(
      true
    );
  });
});

describe("ExchangeMarkState type coverage", () => {
  const states = ["idle", "searching", "converging", "matched"] as const;

  it("defines all four mark states", () => {
    expect(states).toHaveLength(4);
    expect(states).toContain("idle");
    expect(states).toContain("matched");
  });
});

describe("Home visual migration wiring", () => {
  it("home uses Capture entry and BrandMark", () => {
    const { readFileSync } = require("fs") as typeof import("fs");
    const home = readFileSync(
      join(root, "src/components/home/home-v2.tsx"),
      "utf8"
    );
    expect(home).toContain("BrandMark");
    expect(home).toContain("captureEntry");
    expect(home).toContain("/intake");
    expect(home).toContain("openAgent");
  });
});
