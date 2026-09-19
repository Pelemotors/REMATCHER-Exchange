import { describe, expect, it } from "vitest";
import {
  isConvertibleToOwned,
  isOwnedInventoryRelationship,
  isReviewRelationship,
  relationshipBadgeHe,
  vehicleCapabilities,
} from "@/services/vehicles/vehicle-capabilities";

describe("vehicleCapabilities authority", () => {
  it("OWNED / INVENTORY get publication and sold", () => {
    for (const rel of ["OWNED", "INVENTORY"] as const) {
      const caps = vehicleCapabilities({
        dealerRelationship: rel,
        status: "ACTIVE",
      });
      expect(caps.canPublishToNetwork).toBe(true);
      expect(caps.canPublishToCatalog).toBe(true);
      expect(caps.canOutboundShare).toBe(true);
      expect(caps.canMarkSold).toBe(true);
      expect(caps.canArchive).toBe(true);
      expect(caps.canConvertToOwned).toBe(false);
      expect(caps.canRunMarketChecks).toBe(true);
    }
  });

  it("OFFERED_TO_ME and TRADE_IN_CANDIDATE stay non-publishable", () => {
    for (const rel of ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE"] as const) {
      const caps = vehicleCapabilities({
        dealerRelationship: rel,
        status: "ACTIVE",
      });
      expect(caps.canPublishToNetwork).toBe(false);
      expect(caps.canPublishToCatalog).toBe(false);
      expect(caps.canOutboundShare).toBe(false);
      expect(caps.canMarkSold).toBe(false);
      expect(caps.canArchive).toBe(false);
      expect(caps.canConvertToOwned).toBe(true);
      expect(caps.canRunMarketChecks).toBe(true);
    }
  });

  it("EXTERNAL never looks like inventory", () => {
    const caps = vehicleCapabilities({
      dealerRelationship: "EXTERNAL",
      status: "ACTIVE",
    });
    expect(caps.canPublishToNetwork).toBe(false);
    expect(caps.canConvertToOwned).toBe(false);
    expect(caps.canMarkSold).toBe(false);
    expect(caps.canRunMarketChecks).toBe(true);
  });

  it("Hebrew badges never leak domain enums", () => {
    expect(relationshipBadgeHe("OFFERED_TO_ME")).toBe("שוקל לקנות");
    expect(relationshipBadgeHe("TRADE_IN_CANDIDATE")).toBe("טרייד מלקוח");
    expect(relationshipBadgeHe("OWNED")).toBeNull();
    expect(isOwnedInventoryRelationship("OWNED")).toBe(true);
    expect(isReviewRelationship("OFFERED_TO_ME")).toBe(true);
    expect(isConvertibleToOwned("EXTERNAL")).toBe(false);
  });
});
