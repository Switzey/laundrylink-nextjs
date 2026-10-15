import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_LIVE_BASE_URL?.trim() || "https://www.laundrylink.com.ng";
const target = new URL(baseURL);

if (target.protocol !== "https:" || target.hostname !== "www.laundrylink.com.ng") {
  throw new Error("Live QA is locked to https://www.laundrylink.com.ng.");
}

export default defineConfig({
  testDir: "./tests/live",
  outputDir: "test-results/live",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/live", open: "never" }],
    ["json", { outputFile: "test-results/live-results.json" }],
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
