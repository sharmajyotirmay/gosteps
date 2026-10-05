import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { demoBundle } from "./seed";

// Regenerates docs/screenshots/*.png. Run with `pnpm screenshots` (after `pnpm build`).
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate README screenshots");

const out = join(import.meta.dirname, "../docs/screenshots");

async function loadDemo(page: Page) {
  const file = test.info().outputPath("demo.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(demoBundle()));
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("x");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();
  await page.keyboard.press("Escape");
  await page.goto("/settings/");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("Imported backup for Jyotirmay")).toBeVisible();
}

const settle = (page: Page) => page.waitForTimeout(1600);

test("desktop screenshots", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loadDemo(page);

  await page.goto("/");
  await settle(page);
  await page.screenshot({ path: `${out}/dashboard.png` });

  await page.getByRole("button", { name: /Open the System/ }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/system-window.png` });
  await page.getByRole("tab", { name: "Commands" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/system-commands.png` });
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: /Continue:/ }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/quest.png` });

  await page.goto("/quests/boss-p3/");
  await page.getByLabel("go test output").fill(
    [
      "ok  \tgithub.com/jyotirmay/jobq/internal/job\t0.014s\tcoverage: 88.1% of statements",
      "ok  \tgithub.com/jyotirmay/jobq/internal/store\t1.302s\tcoverage: 76.4% of statements",
      "ok  \tgithub.com/jyotirmay/jobq/internal/worker\t0.911s\tcoverage: 71.9% of statements",
    ].join("\n"),
  );
  await page.getByText("This output is from a run with").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/gate-trial.png` });

  await page.goto("/review/");
  await page.getByRole("button", { name: /Show answer/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/review.png` });

  await page.goto("/dsa/");
  await settle(page);
  await page.screenshot({ path: `${out}/dsa.png` });
  await page.screenshot({ path: `${out}/dsa-full.png`, fullPage: true });

  await page.goto("/profile/");
  await settle(page);
  await page.screenshot({ path: `${out}/profile.png` });
});

test("phone screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Open the System/ }).click();
  await page.getByRole("tab", { name: "Status" }).click();
  await settle(page);
  await page.screenshot({ path: `${out}/phone-system.png` });
});
