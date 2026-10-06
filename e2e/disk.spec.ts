import { expect, test } from "@playwright/test";
import { TEST_STORE } from "./fixtures";

// The disk mirror: progress made in one browser is restored into a brand-new (empty) browser.
test("progress is mirrored to a file and restored into a fresh browser", async ({ browser }) => {
  const first = await browser.newContext();
  await first.addInitScript((url) => localStorage.setItem("gosteps.storeUrl", url), TEST_STORE);
  const page = await first.newPage();
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("Disky");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("navigation").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("This computer (file)")).toBeVisible();
  await expect(page.getByText(/gosteps-e2e-\d+\/state\.json/)).toBeVisible();
  await expect(page.getByText(/Last saved/)).toBeVisible({ timeout: 10_000 });
  await first.close();

  // A different browser profile: empty IndexedDB, same computer.
  const second = await browser.newContext();
  await second.addInitScript((url) => localStorage.setItem("gosteps.storeUrl", url), TEST_STORE);
  const p2 = await second.newPage();
  await p2.goto("/");
  await expect(p2.getByText(/Restored your progress from/)).toBeVisible();
  await expect(p2.getByText("Disky").first()).toBeVisible();
  await second.close();
});
