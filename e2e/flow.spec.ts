import { expect, test } from "./fixtures";

test("onboard, open the System window, complete a task", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("A new player has been detected")).toBeVisible();

  await page.getByPlaceholder("Your name").fill("Tester");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();

  // Registration pops the System window with a notice.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("PLAYER REGISTERED").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Floating button + keyboard shortcut reopen it.
  await page.getByRole("button", { name: /Open the System/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Orders" }).click();
  await expect(dialog.getByText("Modules, packages, and the go command")).toBeVisible();
  await dialog.getByRole("button", { name: "Close the System window" }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");

  // Complete the first read task through the active-recall gate.
  await page.getByRole("link", { name: /Continue:/ }).click();
  await expect(page.getByRole("heading", { name: "Toolchain, modules, and project layout" })).toBeVisible();
  await page.getByLabel("Your answer").first().fill("package main with func main");
  await page.getByRole("button", { name: "Reveal the notes" }).click();
  await page.getByRole("button", { name: "I had it" }).click();
  await page.getByText("I did this").first().click();
  await page.getByRole("button", { name: /Complete · \+10 XP/ }).click();
  await expect(page.getByText(/Task complete/)).toBeVisible();

  // The first task unlocks a surprise achievement, which pops the System window.
  await expect(dialog.getByText("ACHIEVEMENT: First Step").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "Ledger" }).click();
  const row = page.getByRole("cell", { name: "Modules, packages, and the go command" });
  await expect(row).toBeVisible();

  // Progress survives a reload (IndexedDB).
  await page.reload();
  await expect(row).toBeVisible();
  await expect(page.getByText("Balance 10")).toBeVisible();
});

test("evidence gate parses go test output", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("Gate");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();
  await page.keyboard.press("Escape");

  await page.goto("/quests/boss-p1/");
  const out = page.getByLabel("go test output");
  await out.fill("ok  \tgithub.com/me/jobq/internal/job\t0.01s\tcoverage: 40.0% of statements");
  await expect(page.getByText("Coverage 40% (need 60%)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Complete/ })).toBeDisabled();
  await out.fill("ok  \tgithub.com/me/jobq/internal/job\t0.01s\tcoverage: 81.0% of statements");
  await expect(page.getByRole("button", { name: /Complete/ })).toBeEnabled();
  await page.getByRole("button", { name: /Complete/ }).click();
  await expect(page.getByRole("dialog").getByText("GATE TRIAL CLEARED").first()).toBeVisible();
});
