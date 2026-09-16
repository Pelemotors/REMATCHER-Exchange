import { describe, expect, it } from "vitest";
import {
  classifyFinanceCondition,
  getAnnualFinanceRate,
  getMaxFinanceTerm,
  monthlyPaymentSpitzer,
  roundIls,
  simulateCatalogFinance,
  FINANCE_RATE_NEW_ZERO_KM,
  FINANCE_RATE_USED,
} from "@/services/catalog/finance-rules";

/** Independent Spitzer copy for expected values — not imported from production. */
function independentSpitzer(P: number, annual: number, n: number): number {
  const r = annual / 12;
  if (r === 0) return P / n;
  return (P * r) / (1 - (1 + r) ** -n);
}

describe("finance term boundaries", () => {
  it("rejects missing and pre-2005 years", () => {
    expect(getMaxFinanceTerm(null)).toBeNull();
    expect(getMaxFinanceTerm(2004)).toBeNull();
  });
  it("2005–2020 → 60", () => {
    expect(getMaxFinanceTerm(2005)).toBe(60);
    expect(getMaxFinanceTerm(2020)).toBe(60);
  });
  it("2021 → 72", () => expect(getMaxFinanceTerm(2021)).toBe(72));
  it("2022 → 84", () => expect(getMaxFinanceTerm(2022)).toBe(84));
  it("2023–2025 → 100", () => {
    expect(getMaxFinanceTerm(2023)).toBe(100);
    expect(getMaxFinanceTerm(2025)).toBe(100);
  });
  it("2026+ → 120", () => {
    expect(getMaxFinanceTerm(2026)).toBe(120);
    expect(getMaxFinanceTerm(2027)).toBe(120);
  });
});

describe("interest class", () => {
  it("defaults to used unless mileage is exactly 0", () => {
    expect(classifyFinanceCondition({})).toBe("USED");
    expect(classifyFinanceCondition({ mileage: 1 })).toBe("USED");
    expect(classifyFinanceCondition({ mileage: 12000 })).toBe("USED");
    expect(classifyFinanceCondition({ mileage: 0 })).toBe("NEW_ZERO_KM");
    expect(getAnnualFinanceRate("USED")).toBe(FINANCE_RATE_USED);
    expect(getAnnualFinanceRate("NEW_ZERO_KM")).toBe(FINANCE_RATE_NEW_ZERO_KM);
  });
});

describe("spitzer formula", () => {
  it("handles zero rate as P/n", () => {
    expect(monthlyPaymentSpitzer(120000, 0, 12)).toBe(10000);
  });
  it("has no balloon — n payments amortize principal", () => {
    const n = 60;
    const r = 0.099 / 12;
    const pmt = monthlyPaymentSpitzer(100000, 0.099, n);
    let balance = 100000;
    for (let i = 0; i < n; i++) {
      const interest = balance * r;
      const principal = pmt - interest;
      balance -= principal;
    }
    expect(Math.abs(balance)).toBeLessThan(1);
  });
});

const CASES = [
  { year: 2020, n: 60, rate: 0.099, label: "2020 used" },
  { year: 2021, n: 72, rate: 0.099, label: "2021 used" },
  { year: 2022, n: 84, rate: 0.099, label: "2022 used" },
  { year: 2024, n: 100, rate: 0.099, label: "2024 used" },
  { year: 2026, n: 120, rate: 0.099, label: "2026 used" },
] as const;

describe("catalog simulation vectors", () => {
  for (const c of CASES) {
    it(`${c.label} matches independent formula`, () => {
      for (const P of [100_000, 150_000, 200_000]) {
        const q = simulateCatalogFinance({
          enabled: true,
          retailPrice: P,
          year: c.year,
          mileage: 40_000,
        });
        expect(q?.termMonths).toBe(c.n);
        expect(q?.annualRate).toBe(c.rate);
        expect(q?.monthlyIls).toBe(roundIls(independentSpitzer(P, c.rate, c.n)));
      }
    });
  }

  it("2026 confirmed 0km uses 8.4%", () => {
    const q = simulateCatalogFinance({
      enabled: true,
      retailPrice: 100_000,
      year: 2026,
      mileage: 0,
    });
    expect(q?.annualRate).toBe(0.084);
    expect(q?.termMonths).toBe(120);
    expect(q?.monthlyIls).toBe(roundIls(independentSpitzer(100_000, 0.084, 120)));
  });

  it("OFF or missing retail → no quote", () => {
    expect(
      simulateCatalogFinance({ enabled: false, retailPrice: 100000, year: 2024 })
    ).toBeNull();
    expect(
      simulateCatalogFinance({ enabled: true, retailPrice: null, year: 2024 })
    ).toBeNull();
  });
});
