import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CATALOG_LEGAL_FINANCE,
  CATALOG_LEGAL_GENERAL,
  simulateCatalogFinance,
} from "@/services/catalog/finance-rules";
import { catalogVehicleInterestText } from "@/services/catalog/whatsapp-interest";

const PUBLIC_SELECT_FORBIDDEN = [
  "b2bPrice",
  "dealerPrice",
  "margin",
  "sellerFloor",
  "budgetMax",
];

function readSrc(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("public catalog never leaks dealer pricing", () => {
  it("catalog-service public mapper has no dealer price fields", () => {
    const src = readSrc("src/services/catalog/catalog-service.ts");
    expect(src).toContain("retailPrice: true");
    expect(src).not.toMatch(/b2bPrice/);
    expect(src).toMatch(/finance:\s*finance\s*\?\s*\{\s*monthlyIls:/);
    expect(src).not.toMatch(/annualRate/);
    expect(src).not.toMatch(/conditionClass/);
    expect(src).not.toMatch(/conditionNotes/);
  });

  it("public catalog pages serialize only retailPrice", () => {
    for (const rel of [
      "src/app/c/[slug]/page.tsx",
      "src/app/c/[slug]/vehicles/[vehicleId]/page.tsx",
      "src/components/catalog/catalog-public-shared.tsx",
    ]) {
      const src = readSrc(rel);
      for (const token of PUBLIC_SELECT_FORBIDDEN) {
        expect(src, rel).not.toMatch(new RegExp(token));
      }
      expect(src).not.toMatch(/dealerPrice/);
    }
  });

  it("WhatsApp interest copy uses vehicle context without dealerPrice", () => {
    const text = catalogVehicleInterestText({
      title: "Renault Clio",
      make: "Renault",
      model: "Clio",
      year: 2022,
      retailPrice: 149900,
    });
    expect(text).toContain("Renault Clio");
    expect(text).toContain("2022");
    expect(text).toContain("היי, אני מתעניין");
    expect(text).not.toMatch(/b2b|134000|dealerPrice/);
    expect(text).not.toContain("149,900");
    const src = readSrc("src/services/catalog/whatsapp-interest.ts");
    expect(src).not.toMatch(/b2bPrice/);
  });

  it("finance OFF produces no monthly quote", () => {
    expect(
      simulateCatalogFinance({
        enabled: false,
        retailPrice: 149900,
        year: 2024,
        mileage: 10000,
      })
    ).toBeNull();
  });

  it("finance ON without retail produces no quote", () => {
    expect(
      simulateCatalogFinance({
        enabled: true,
        retailPrice: null,
        year: 2024,
      })
    ).toBeNull();
  });

  it("legal copy is non-credit and present in the public footer", () => {
    expect(CATALOG_LEGAL_GENERAL).toContain("ט.ל.ח");
    expect(CATALOG_LEGAL_FINANCE).toContain("להמחשה בלבד");
    expect(CATALOG_LEGAL_FINANCE).not.toMatch(/מובטח|אישור מיידי|החזר קבוע|APR|גוף מממן/);
    const footer = readSrc("src/components/catalog/catalog-public-shared.tsx");
    expect(footer).toContain("CATALOG_LEGAL_GENERAL");
    expect(footer).toContain("hasFinanceDisplay");
    const shared = readSrc("src/components/catalog/catalog-public-shared.tsx");
    expect(shared).toContain("החל מ-");
    const list = readSrc("src/app/c/[slug]/page.tsx");
    expect(list).toContain("formatFinanceFrom");
    const detail = readSrc("src/app/c/[slug]/vehicles/[vehicleId]/page.tsx");
    expect(detail).toContain("CATALOG_FINANCE_ASTERISK");
    expect(detail).toContain("עד {vehicle.finance.termMonths} תשלומים");
    expect(detail).not.toContain("מימון 100% מובטח");
    expect(detail).not.toContain("אפשרות למימון עד 100%");
  });

  it("showMonthlyFinance defaults off in schema and migration", () => {
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(
      /showMonthlyFinance Boolean @default\(false\)/
    );
    const migration = readSrc(
      "prisma/migrations/20260916220000_catalog_finance_display/migration.sql"
    );
    expect(migration).toMatch(/DEFAULT false/);
  });
});
