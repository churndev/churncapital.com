import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "*.spec.js",
  timeout: 90000,
  expect: { timeout: 30000 },
  reporter: "line",
  use: { headless: true },
  webServer: {
    command: "python3 -m http.server 4173 --directory public",
    port: 4173,
    reuseExistingServer: true,
  },
});
