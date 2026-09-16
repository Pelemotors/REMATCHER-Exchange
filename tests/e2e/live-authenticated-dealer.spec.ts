/**
 * Authenticated live journeys on Production.
 * Credentials: E2E_DEALER_EMAIL + E2E_DEALER_PASSWORD (never committed).
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.env.LIVE_BASE_URL ?? "https://exchange.rematcher.co.il";
const OUT = path.join(
  process.cwd(),
  "docs/visual-evidence/live-prod",
  new Date().toISOString().slice(0, 10)
);

function loadCreds(): { email: string; password: string } | null {
  if (process.env.E2E_DEALER_EMAIL && process.env.E2E_DEALER_PASSWORD) {
    return {
      email: process.env.E2E_DEALER_EMAIL,
      password: process.env.E2E_DEALER_PASSWORD,
    };
  }
  const file = path.join(process.cwd(), ".qa-dealer-credentials.local");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  const emailMatch = raw.match(/qa-buyer@rematcher-exchange\.test/);
  const passMatch = raw.match(
    /qa-buyer@rematcher-exchange\.test\s*\/\s*(\S+)/
  );
  if (emailMatch && passMatch) {
    return { email: "qa-buyer@rematcher-exchange.test", password: passMatch[1] };
  }
  const jsonTry = raw.trim().startsWith("{") || raw.trim().startsWith("[");
  if (jsonTry) {
    const parsed = JSON.parse(raw) as Array<{ email: string; password: string }>;
    const row = parsed.find((p) => p.email.includes("qa-buyer")) ?? parsed[0];
    if (row?.email && row?.password) return row;
  }
  return null;
}

test.describe("Authenticated Production dealer", () => {
  test("inventory shows remove-without-sold and photo delete", async ({ page }) => {
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("#email").fill(creds!.email);
    await page.locator("#password").fill(creds!.password);
    await page.getByRole("button", { name: /התחבר|כניסה/i }).click();
    await page.waitForURL(/\/(home|inventory|intake)/, { timeout: 20000 });
    await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "המלאי שלי" })).toBeVisible();
    await expect(page.getByText("הסר מהמלאי")).toBeHidden();
    const firstRow = page.locator("button[id^='vehicle-']").first();
    if (await firstRow.count()) {
      await firstRow.click();
      await expect(page.getByRole("button", { name: "הסר מהמלאי" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "תמונות הרכב" })).toBeVisible();
    }
    await page.screenshot({
      path: path.join(OUT, "inventory-authenticated-390.png"),
      fullPage: true,
    });
  });

  test("intake conversation is one agent, not a screenshot bot", async ({ page }) => {
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("#email").fill(creds!.email);
    await page.locator("#password").fill(creds!.password);
    await page.getByRole("button", { name: /התחבר|כניסה/i }).click();
    await page.waitForURL(/\/(home|inventory|intake)/, { timeout: 20000 });
    await page.goto(`${BASE}/intake/handoff`, { waitUntil: "networkidle" });
    await expect(page.getByText("שלח לי את הרכב")).toBeVisible();
    await expect(page.getByText("הדבק טקסט / מידע")).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "intake-authenticated-390.png"),
      fullPage: true,
    });
  });
});
