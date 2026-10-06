import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A fresh temp folder per run for the throwaway local store.
const storeDir = join(tmpdir(), `gosteps-e2e-${Date.now()}`);

// Runs against the static build (pnpm build first). Uses installed Chrome locally,
// Playwright's Chromium in CI (`pnpm exec playwright install chromium`).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" } }],
  webServer: [
    { command: "pnpm dlx serve@14 out -l 4173", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 60_000 },
    // Throwaway local store for tests: its own port and a temp folder, never your real .gosteps-data/.
    {
      command: "tsx scripts/local-store.ts",
      url: "http://127.0.0.1:4799/health",
      env: { GOSTEPS_STORE_PORT: "4799", GOSTEPS_DATA_DIR: storeDir },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
