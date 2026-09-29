import { defineConfig, devices } from "@playwright/test";

// Runs against the static build (pnpm build first). Uses installed Chrome locally,
// Playwright's Chromium in CI (`pnpm exec playwright install chromium`).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" } }],
  webServer: { command: "pnpm dlx serve@14 out -l 4173", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
