/**
 * Regression: public Field Test must not crash after Owner login.
 * Run: FIELD_TEST_OWNER_PASSWORD=... npx playwright test tests/browser/field-test-owner-journey.spec.ts
 */
import { test, expect } from "@playwright/test";

const BASE =
  process.env.FIELD_TEST_PUBLIC_URL ||
  "https://field-test-exchange.rematcher.co.il";
const EMAIL = process.env.FIELD_TEST_OWNER_EMAIL || "galsamama@gmail.com";
const PASSWORD = process.env.FIELD_TEST_OWNER_PASSWORD;

test.describe("Field Test owner journey (public HTTPS)", () => {
  test.skip(!PASSWORD, "FIELD_TEST_OWNER_PASSWORD required");

  test("login → home without Application error / pageerror", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD!);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/home/, { timeout: 30000 });
    await page.waitForTimeout(2000);

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Application error/i);
    expect(pageErrors.join("\n")).not.toMatch(
      /Cannot destructure property 'data'|TypeError/i
    );

    for (const path of [
      "/demand",
      "/matches",
      "/inventory",
      "/intake/handoff",
      "/intake/review",
    ]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("load").catch(() => undefined);
      await page.waitForTimeout(600);
      const t = await page.locator("body").innerText();
      expect(t, path).not.toMatch(/Application error/i);
    }
    expect(pageErrors).toEqual([]);
  });
});
