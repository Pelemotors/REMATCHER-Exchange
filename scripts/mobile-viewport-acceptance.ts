/**
 * Mobile viewport acceptance (WebKit/Chromium emulation) against a live URL.
 * Does NOT prove native Share Sheet — that requires physical devices.
 *
 * Usage:
 *   MOBILE_ACCEPTANCE_URL=https://field-test-exchange.rematcher.co.il npx tsx scripts/mobile-viewport-acceptance.ts
 */
import { chromium, webkit, devices } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE =
  process.env.MOBILE_ACCEPTANCE_URL ||
  "https://field-test-exchange.rematcher.co.il";
const OUT = join(process.cwd(), "test-results", "mobile-acceptance");

const routes = [
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/home",
  "/demand",
  "/inventory",
  "/matches",
  "/opportunities",
  "/activity",
  "/intake/handoff",
];

async function runEngine(
  name: "chromium" | "webkit",
  launch: typeof chromium,
  device: (typeof devices)[string]
) {
  const browser = await launch.launch({ headless: true });
  const context = await browser.newContext({
    ...device,
    locale: "he-IL",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const results: Array<{ route: string; status: number; title: string }> = [];
  for (const route of routes) {
    const res = await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const status = res?.status() ?? 0;
    results.push({ route, status, title: await page.title() });
    await page.screenshot({
      path: join(OUT, `${name}${route.replace(/\W+/g, "_") || "_home"}.png`),
      fullPage: true,
    });
  }

  await browser.close();
  return { name, results, errors: errors.slice(0, 20) };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const iphone = devices["iPhone 13"];
  const pixel = devices["Pixel 5"];
  const reports = [];
  reports.push(await runEngine("chromium", chromium, pixel));
  try {
    reports.push(await runEngine("webkit", webkit, iphone));
  } catch (e) {
    reports.push({
      name: "webkit",
      results: [],
      errors: [`webkit_unavailable: ${e instanceof Error ? e.message : e}`],
    });
  }
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ BASE, reports }, null, 2));
  console.log(JSON.stringify({ BASE, out: OUT, reports }, null, 2));
  const hardFail = reports.some((r) =>
    r.results.some((x) => x.status >= 500 || x.status === 0)
  );
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
