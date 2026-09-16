import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Marketing landing v3", () => {
  it("root page uses ExchangeLanding and auth redirect", () => {
    const page = read("src/app/page.tsx");
    expect(page).toContain("ExchangeLanding");
    expect(page).toContain("getPostAuthRedirect");
    expect(page).not.toContain("HeroV2");
  });

  it("landing has required sections and mandated copy", () => {
    const src = read("src/components/landing/v3/exchange-landing.tsx");
    const copy = read("src/components/landing/v3/landing-copy.ts");
    const all = `${src}\n${copy}`;
    expect(all).toContain("אל תחפש ברשת");
    expect(all).toContain("מה עובר אצלך היום?");
    expect(all).toContain("כבר קיבלת את המידע");
    expect(all).toContain("איך REMATCHER עובדת?");
    expect(all).toContain("הרשת יודעת");
    expect(all).toContain("לא רק למצוא התאמה");
    expect(all).toContain("המלאי שלך כבר בפנים");
    expect(all).toContain("פשוט תשאל את REMATCHER");
    expect(all).toContain("גם כשאתה לא מחפש");
    expect(all).toContain("More Cars. Better Business.");
    expect(all).not.toContain("+32%");
    expect(all).not.toContain("ExchangeMark");
  });

  it("uses BrandMark R assets and swappable photography paths", () => {
    const src = read("src/components/landing/v3/exchange-landing.tsx");
    const copy = read("src/components/landing/v3/landing-copy.ts");
    expect(src).toContain("BrandMark");
    expect(copy).toContain("hero-showroom");
    expect(existsSync(join(root, "public/brand/landing/hero-showroom.webp"))).toBe(
      true
    );
    expect(existsSync(join(root, "public/brand/landing/cta-headlights.webp"))).toBe(
      true
    );
  });

  it("digital catalog CTA is honest about availability", () => {
    const src = read("src/components/landing/v3/exchange-landing.tsx");
    expect(src).toContain("הפעל את הקטלוג שלי");
    expect(src).toContain("אופציונלי לחלוטין");
    expect(src).not.toContain("יכולת מוצרית מתוכננת");
  });
});
