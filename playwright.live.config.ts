import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/live-prod-visual.spec.ts",
  timeout: 60_000,
  retries: 0,
  use: {
    ignoreHTTPSErrors: true,
    locale: "he-IL",
    baseURL: "https://exchange.rematcher.co.il",
  },
});
