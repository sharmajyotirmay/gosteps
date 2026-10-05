import { expect, test } from "@playwright/test";

test("DSA track: start at onboarding, log problems, see progress everywhere", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("Coder");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Also start the DSA track")).toBeChecked();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("DSA CHALLENGE ACCEPTED").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // The DSA set is part of today's Daily Orders.
  await expect(page.getByText(/DSA day 1\/100: 10 problems · Arrays and hash maps/)).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "DSA" }).click();
  await expect(page.getByRole("heading", { name: "1000 Problems in 100 Days" })).toBeVisible();

  // Log an anchor problem by URL.
  await page.getByLabel("LeetCode URL, slug, or title").fill("https://leetcode.com/problems/two-sum/");
  await page.getByRole("button", { name: /Log · \+10 XP/ }).click();
  await expect(page.getByText(/Logged · \+10 XP/)).toBeVisible();
  // The first problem unlocks a surprise achievement, which pops the System window.
  await expect(dialog.getByText("ACHIEVEMENT: First Problem").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("1 / 10 today")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Two Sum/ })).toBeVisible();

  // A hint attempt goes into the log (and later the redo queue) at half XP.
  await page.getByLabel("LeetCode URL, slug, or title").fill("group-anagrams");
  await page.getByText("Needed a hint").click();
  await page.getByRole("button", { name: /Log · \+9 XP/ }).click();
  await expect(page.getByText("2 / 10 today")).toBeVisible();

  // Studying the pattern adds cards to the shared review deck.
  await page.getByRole("button", { name: /I studied this pattern/ }).click();
  await expect(page.getByRole("navigation").getByRole("link", { name: /Review/ })).toContainText("3");

  // Progress shows up on the dashboard and in the System window.
  await page.getByRole("navigation").getByRole("link", { name: "Status" }).click();
  await expect(page.getByText("2 / 10 today")).toBeVisible();
  await page.getByRole("button", { name: /Open the System/ }).click();
  await dialog.getByRole("tab", { name: "Status" }).click();
  await expect(dialog.getByText("2/1000 · day 1/100")).toBeVisible();
});
