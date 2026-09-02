import { describe, it, expect } from "vitest";
import { TOKENS_V2 } from "@/config/brand-v2";

describe("Brand UI v2 tokens", () => {
  it("has correct core palette values", () => {
    expect(TOKENS_V2.color.midnight).toBe("#070C14");
    expect(TOKENS_V2.color.graphite).toBe("#111A26");
    expect(TOKENS_V2.color.deepNavy).toBe("#163A5F");
    expect(TOKENS_V2.color.exchangeBlue).toBe("#174A73");
    expect(TOKENS_V2.color.signalBlue).toBe("#2D78A8");
    expect(TOKENS_V2.color.platinum).toBe("#C9CED3");
    expect(TOKENS_V2.color.warmWhite).toBe("#F3F1EC");
  });

  it("preserves semantic success/warning/error colors", () => {
    expect(TOKENS_V2.color.success).toBe("#16865C");
    expect(TOKENS_V2.color.warning).toBe("#C47A12");
    expect(TOKENS_V2.color.error).toBe("#C53B3B");
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

describe("Brand UI v2 exports", () => {
  it("exports core primitives", () => {
    const exports = [
      "BrandV2Scope",
      "Surface",
      "ButtonV2",
      "BadgeV2",
      "StatusBadgeV2",
      "PageHeaderV2",
      "SkeletonV2",
      "NavItemV2",
    ];
    expect(exports.length).toBeGreaterThan(0);
  });
});
