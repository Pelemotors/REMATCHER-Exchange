import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/live-*.spec.ts",
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    ignoreHTTPSErrors: true,
    locale: "he-IL",
    baseURL: process.env.LIVE_BASE_URL ?? "https://exchange.rematcher.co.il",
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
  },
});
