import { describe, expect, it } from "vitest";
import {
  normalizePlateDigits,
  resolveStructuredPlate,
  PLATE_OCR_MIN_CONFIDENCE,
} from "@/services/intake/plate-ocr-result";

describe("plate OCR normalization", () => {
  it("collapses punctuation and spaces to the same identity", () => {
    expect(normalizePlateDigits("905-63-201")).toBe("90563201");
    expect(normalizePlateDigits("905 63 201")).toBe("90563201");
    expect(normalizePlateDigits("90563201")).toBe("90563201");
  });

  it("accepts a confident matching structured result", () => {
    const r = resolveStructuredPlate({
      plateNumber: "905-63-201",
      visibleText: "905-63-201",
      confidence: 0.99,
    });
    expect(r?.value).toBe("90563201");
    expect(r?.confidence).toBeGreaterThanOrEqual(PLATE_OCR_MIN_CONFIDENCE);
  });

  it("rejects when plateNumber and visibleText disagree", () => {
    expect(
      resolveStructuredPlate({
        plateNumber: "90583201",
        visibleText: "905-63-201",
        confidence: 0.99,
      })
    ).toBeNull();
  });

  it("never invents missing digits", () => {
    expect(
      resolveStructuredPlate({
        plateNumber: "905632",
        visibleText: "905-63",
        confidence: 0.99,
      })
    ).toBeNull();
  });

  it("rejects low confidence even if digits look complete", () => {
    expect(
      resolveStructuredPlate({
        plateNumber: "90563201",
        visibleText: "90563201",
        confidence: 0.4,
      })
    ).toBeNull();
  });

  it("returns no plate when the model is not confident", () => {
    expect(
      resolveStructuredPlate({
        plateNumber: null,
        visibleText: "interior dashboard",
        confidence: 0.2,
      })
    ).toBeNull();
  });
});
