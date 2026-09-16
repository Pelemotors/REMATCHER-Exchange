import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { extractCustomerHintsFromText } from "@/services/capture/customer-extract";
import {
  relationshipLabelHe,
  visibilityLabelHe,
  demandStatusLabelHe,
} from "@/lib/vehicle-labels-he";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Understanding Result + Capture confirm", () => {
  it("UnderstandingResult component exists with network + private CTAs", () => {
    const src = read("src/components/capture/understanding-result.tsx");
    expect(src).toContain("הפעל חיפוש ברשת");
    expect(src).toContain("שמור פרטי");
    expect(src).toContain("מה REMATCHER הבינה");
    expect(existsSync(join(root, "src/components/capture/understanding-result.module.css"))).toBe(
      true
    );
  });

  it("CreateDemandFlow uses UnderstandingResult and publishMode", () => {
    const src = read("src/components/demand/create-demand-flow.tsx");
    expect(src).toContain("UnderstandingResult");
    expect(src).toContain('publishMode: "network" | "private"');
    expect(src).toContain('handleConfirm("private")');
  });

  it("parse API returns customerHints and defaults PRIVATE", () => {
    const src = read("src/app/api/demands/parse/route.ts");
    expect(src).toContain("customerHints");
    expect(src).toContain('networkVisibility: "PRIVATE"');
    expect(src).toContain("extractCustomerHintsFromText");
  });

  it("confirm API supports private vs network without inventing phone requirement", () => {
    const src = read("src/app/api/demands/confirm/route.ts");
    expect(src).toContain('publishMode === "private"');
    expect(src).toContain("ANONYMOUS_NETWORK");
    expect(src).toContain("upsertCustomerForDealer");
    expect(src).toContain("runMatchingForDemand");
  });

  it("customer extract finds Ahmad + Tucson cues without inventing phone", () => {
    const h = extractCustomerHintsFromText(
      "אחמד מחפש Hyundai Tucson 2020 עד 125000 עדיף היברידי"
    );
    expect(h.name).toBe("אחמד");
    expect(h.phone).toBeNull();
    expect(h.hybridSoft).toBe(true);
  });
});

describe("Customers UI", () => {
  it("customers page and client exist", () => {
    expect(existsSync(join(root, "src/app/(dealer)/customers/page.tsx"))).toBe(
      true
    );
    const src = read("src/components/customers/customers-page-client.tsx");
    expect(src).toContain("לקוחות");
    expect(src).toContain("/api/customers");
    expect(src).toContain("pause");
  });

  it("account links to customers", () => {
    expect(read("src/app/(dealer)/account/page.tsx")).toContain("/customers");
  });
});

describe("Vehicle Hebrew relationship/visibility", () => {
  it("labels are human Hebrew not DB enums", () => {
    expect(relationshipLabelHe("OFFERED_TO_ME")).toBe("מציעים לי");
    expect(relationshipLabelHe("TRADE_IN_CANDIDATE")).toBe("טרייד");
    expect(relationshipLabelHe("OWNED")).toBe("הרכב שלי");
    expect(visibilityLabelHe("PRIVATE")).toBe("פרטי");
    expect(visibilityLabelHe("ANONYMOUS_NETWORK")).toBe("פעיל ברשת");
    expect(demandStatusLabelHe("PAUSED")).toBe("מושהה");
  });

  it("public layout and empty states use BrandMark R not Exchange X", () => {
    expect(read("src/components/public/public-layout.tsx")).toContain("BrandMark");
    expect(read("src/components/public/public-layout.tsx")).not.toContain("ExchangeMark");
    expect(read("src/components/ui/brand-v2/empty-state-v2.tsx")).toContain("BrandMark");
    expect(read("src/components/auth/login-form.tsx")).toContain("BrandMark");
  });

  it("inventory UI surfaces RelationshipBadge + VisibilityBadge", () => {
    const src = read("src/components/inventory/inventory-page-client.tsx");
    expect(src).toContain("RelationshipBadge");
    expect(src).toContain("VisibilityBadge");
  });

  it("list-inventory selects relationship and visibility", () => {
    const src = read("src/services/inventory/list-inventory.ts");
    expect(src).toContain("dealerRelationship: true");
    expect(src).toContain("visibility: true");
  });
});
