/**
 * Live visual smoke for exchange.rematcher.co.il
 * Usage: npx playwright test tests/e2e/live-prod-visual.spec.ts --config=playwright.live.config.ts
 */
import { test, expect } from "@playwright/test";
import path from "path";

const BASE = process.env.LIVE_BASE_URL ?? "https://exchange.rematcher.co.il";
const OUT = path.join(
  process.cwd(),
  "docs/visual-evidence/live-prod",
  new Date().toISOString().slice(0, 10)
);

test.describe("Live Production visual", () => {
  test("login mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("data-brand-ui", "2");
    // Gold R asset present (img or next/image)
    const r = page.locator('img[src*="rematcher-r-gold"]');
    await expect(r.first()).toBeVisible({ timeout: 15000 });
    // No legacy Exchange X SVG classes in header
    await expect(page.locator(".exchange-mark_mark__ETkqk")).toHaveCount(0);
    await page.screenshot({
      path: path.join(OUT, "login-390x844.png"),
      fullPage: true,
    });
  });

  test("login desktop 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await expect(page.locator('img[src*="rematcher-r-gold"]').first()).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "login-1440x900.png"),
      fullPage: true,
    });
  });

  test("signup + brand asset HTTP", async ({ page, request }) => {
    const asset = await request.get(`${BASE}/brand/rematcher-r-gold.svg`);
    expect(asset.status()).toBe(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(OUT, "signup-390x844.png"),
      fullPage: true,
    });
  });

  test("landing desktop 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "אל תחפש ברשת"
    );
    await expect(page.locator('[data-landing="v3"]')).toBeVisible();
    await expect(page.locator('img[src*="rematcher-r-gold"]').first()).toBeVisible();
    // no horizontal overflow
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: path.join(OUT, "landing-desktop-1440.png"),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(OUT, "landing-desktop-full.png"),
      fullPage: true,
    });
  });

  test("landing mobile 390", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("מה עובר אצלך היום?")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: path.join(OUT, "landing-mobile-390.png"),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(OUT, "landing-mobile-full.png"),
      fullPage: true,
    });
  });
});
