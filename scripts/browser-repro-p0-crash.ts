/**
 * Reproduce Field Test public browser crash (P0).
 * Run: npx playwright test tests/browser/field-test-repro-crash.spec.ts
 */
import { chromium, type ConsoleMessage, type Page } from "playwright";

const BASE =
  process.env.FIELD_TEST_PUBLIC_URL ||
  "https://field-test-exchange.rematcher.co.il";

async function collect(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failed: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err));
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failed.push(`${res.status()} ${res.url()}`);
    }
  });

  return { consoleErrors, pageErrors, failed };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const bags = await collect(page);

  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({
    path: "/tmp/ft-p0-repro-root.png",
    fullPage: true,
  });

  const report = {
    url: page.url(),
    hasApplicationError: /Application error/i.test(bodyText),
    bodySnippet: bodyText.slice(0, 400),
    pageErrors: bags.pageErrors,
    consoleErrors: bags.consoleErrors.filter(
      (t) => !/favicon|Download the React DevTools/i.test(t)
    ),
    failedCritical: bags.failed.filter((f) => !/favicon\.ico/.test(f)),
  };
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.hasApplicationError || report.pageErrors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
