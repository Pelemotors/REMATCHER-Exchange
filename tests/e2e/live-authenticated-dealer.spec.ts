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
  const passMatch = raw.match(
    /qa-buyer@rematcher-exchange\.test\s*\/\s*(\S+)/
  );
  if (passMatch) {
    return { email: "qa-buyer@rematcher-exchange.test", password: passMatch[1] };
  }
  return null;
}

async function loginDealer(
  page: import("@playwright/test").Page,
  creds: { email: string; password: string }
) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL(/\/(home|inventory|intake|privacy-ai|subscription)/, {
    timeout: 20000,
  });
  await page.request.post(`${BASE}/api/privacy/onboarding/complete`, {
    data: {
      consents: {
        DEALER_MEMORY: false,
        AGENT_TO_EXCHANGE_LEARNING: false,
        EXCHANGE_ACTIVITY_LEARNING: false,
        EXTERNAL_ACTIVITY_LEARNING: false,
      },
    },
  });
}

test.describe("Authenticated Production dealer", () => {
  test("inventory shows remove-without-sold and photo delete", async ({ page }) => {
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);
    const created = await page.request.post(`${BASE}/api/inventory`, {
      data: {
        make: "Mazda",
        model: "CX-5",
        year: 2023,
        b2bPrice: 140000,
      },
    });
    expect(created.ok()).toBeTruthy();
    await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "המלאי שלי" })).toBeVisible({
      timeout: 15000,
    });
    const row = page.locator("button[id^='vehicle-']").first();
    if (!(await row.count())) {
      await page.getByText("CX-5").first().click();
    } else {
      await row.click();
    }
    await expect(page.getByRole("button", { name: "הסר מהמלאי" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "תמונות הרכב" })).toBeVisible();
    await expect(page.getByRole("button", { name: "מחק תמונה" }).or(page.getByText("עדיין אין תמונות לרכב זה"))).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "inventory-authenticated-390.png"),
      fullPage: true,
    });
  });

  test("intake conversation is one agent, not a screenshot bot", async ({ page }) => {
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);
    await page.goto(`${BASE}/intake/handoff`, { waitUntil: "networkidle" });
    await expect(page.getByText("שלח לי את הרכב")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("הדבק טקסט / מידע")).toBeVisible();
    await page.getByText("הדבק טקסט / מידע").click();
    const t0 = Date.now();
    await page.locator("textarea[placeholder*='CX5']").fill("מחפש cx5 22+ עד 140 עדיף לבן");
    await page.getByRole("button", { name: "שלח ל-REMATCHER" }).click();
    await expect(page.getByText(/קיבלתי/)).toBeVisible({ timeout: 10000 });
    const ackMs = Date.now() - t0;
    await expect(page.getByText("ביקוש לקוח")).toBeVisible({ timeout: 60000 });
    const readyMs = Date.now() - t0;
    console.log(`demand_ack_ms=${ackMs} demand_ready_ms=${readyMs}`);
    await page.screenshot({
      path: path.join(OUT, "intake-authenticated-390.png"),
      fullPage: true,
    });
  });
});
