import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 90_000,
  retries: 0,
  use: {
    ignoreHTTPSErrors: true,
    locale: "he-IL",
  },
});
