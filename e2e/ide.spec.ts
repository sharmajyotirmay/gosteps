import { expect, test } from "./fixtures";
import { TEST_IDE } from "./fixtures";

// Needs Docker with the Go image pulled (`pnpm ide:setup`); skipped otherwise (e.g. CI).
test.beforeEach(async ({ page, request }) => {
  const h = await request.get(`${TEST_IDE}/health`).then((r) => r.json()).catch(() => null);
  test.skip(!h?.docker?.available || !h?.docker?.imageReady, "Docker sandbox not available");
  await page.addInitScript((url) => localStorage.setItem("gosteps.ideUrl", url), TEST_IDE);
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("Coder");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Accept the System" }).click();
  await page.keyboard.press("Escape");
});

test("write Go in the IDE and run its tests in the sandbox", async ({ page }) => {
  await page.getByRole("navigation").getByRole("link", { name: "IDE" }).click();
  await expect(page.getByRole("heading", { name: "IDE" })).toBeVisible();
  await expect(page.getByLabel("Module")).toHaveValue("jobq");

  await page.getByLabel("New file path").fill("calc/calc_test.go");
  await page.getByRole("button", { name: "New file" }).click();
  const editor = page.getByLabel("Editor: jobq/calc/calc_test.go");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText('package calc\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) {\n\tif 2+3 != 5 {\n\t\tt.Fatal("math")\n\t}\n}\n');
  await page.keyboard.press("ControlOrMeta+s");

  await page.getByRole("button", { name: "Test -race" }).click();
  await expect(page.getByText(/ok\s+jobq\/calc/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/exit 0/)).toBeVisible();
  await expect(page.getByText("# sandbox: no network, read-only system")).toBeVisible();
});

test("open a DSA problem in the IDE from the DSA page", async ({ page }) => {
  await page.getByRole("navigation").getByRole("link", { name: "DSA" }).click();
  await page.getByRole("button", { name: "Open in IDE" }).click();
  await expect(page).toHaveURL(/\/ide\/?\?open=dsa-go%2Ft01-hashing%2Ftwo_sum%2Fsolution\.go/);
  await expect(page.getByLabel("Editor: dsa-go/t01-hashing/two_sum/solution.go")).toContainText("package two_sum");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByText(/ok\s+dsa\/t01-hashing\/two_sum/)).toBeVisible({ timeout: 120_000 });
});
