/**
 * Pixel-faithful dealer UI — source-of-truth assertions (no live network).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { MOBILE_BOTTOM_NAV_ITEMS } from "@/config/mobile-nav";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("Pixel-faithful dealer shell", () => {
  it("bottom nav is Capture-centered Reference order", () => {
    expect(MOBILE_BOTTOM_NAV_ITEMS.map((i) => i.label)).toEqual([
      "בית",
      "המלאי",
      "קליטת רכב",
      "חיפוש",
      "עוד",
    ]);
    expect(MOBILE_BOTTOM_NAV_ITEMS.map((i) => i.href)).toEqual([
      "/home",
      "/inventory",
      "/intake/handoff",
      "/demand",
      "/account",
    ]);
    expect(MOBILE_BOTTOM_NAV_ITEMS.filter((i) => i.capture)).toHaveLength(1);
  });

  it("mobile nav uses Link not full-document <a> reloads", () => {
    const src = read("src/components/layout/app-shell-v2.tsx");
    expect(src).toContain('from "next/link"');
    expect(src).toContain("captureFab");
    expect(src).not.toMatch(/<a\s+href=\{item\.href\}/);
  });

  it("no permanent Agent FAB on dealer shell", () => {
    const ui = read("src/components/assistant/agent-workspace.tsx");
    expect(ui).toContain("const showFab = false");
  });

  it("inventory page does not block paint on getInventoryList", () => {
    const page = read("src/app/(dealer)/inventory/page.tsx");
    expect(page).not.toContain("getInventoryList");
    expect(page).toContain("initialData={null}");
  });

  it("admin is not wrapped in dealer AppShellV2", () => {
    const admin = existsSync(join(root, "src/app/admin/layout.tsx"))
      ? read("src/app/admin/layout.tsx")
      : read("src/app/(admin)/layout.tsx");
    expect(admin).not.toContain("AppShellV2");
  });
});

describe("Pixel-faithful Capture / conversation", () => {
  it("Capture has orb, three action cards, WhatsApp hint, composer", () => {
    const ui = read("src/components/intake/intake-handoff-client.tsx");
    expect(ui).toContain("AgentOrb");
    expect(ui).toContain("קליטת רכב");
    expect(ui).toContain("שלח לי את הרכב — אני כבר אטפל בשאר.");
    expect(ui).toContain("בחר מהגלריה");
    expect(ui).toContain("צלם רכב");
    expect(ui).toContain("הדבק טקסט / מידע");
    expect(ui).toContain("WhatsApp");
    expect(ui).toContain("כתוב ל-REMATCHER...");
    expect(ui).toContain("למלאי שלי");
    expect(ui).toContain("מציעים לי");
    expect(ui).toContain("טרייד");
    expect(ui).toContain("רק בודק");
    expect(ui).not.toContain("OpenAI");
    expect(ui).not.toContain("OCR API");
    expect(ui).not.toContain("GOV endpoint");
  });

  it("intent grid is 2×2 with colored actions", () => {
    const css = read("src/components/intake/intake-conversation.module.css");
    expect(css).toContain("grid-template-columns: 1fr 1fr");
    expect(css).toContain(".actionOwned");
    expect(css).toContain(".actionOffered");
    expect(css).toContain(".actionTrade");
    expect(css).toContain(".actionCheck");
    expect(css).toContain("safe-area-inset");
  });

  it("Agent Orb asset exists as component not inline base64", () => {
    const orb = read("src/components/brand/agent-orb.tsx");
    expect(orb).toContain("BrandMark");
    expect(orb).not.toMatch(/data:image\/[^;]+;base64,/);
    expect(existsSync(join(root, "src/components/brand/agent-orb.module.css"))).toBe(
      true
    );
  });
});
