import { test as base } from "@playwright/test";

// Tests never touch your real local store (port 4777). By default the disk mirror is pointed at a
// port where nothing listens, so each test starts clean; e2e/disk.spec.ts uses the throwaway store.
export const NO_STORE = "http://127.0.0.1:9";
export const TEST_STORE = "http://127.0.0.1:4799";
export const TEST_IDE = "http://127.0.0.1:4798";

export const test = base.extend({
  page: async ({ page }, provide) => {
    // Likewise the IDE runner: never your real workspace.
    await page.addInitScript((url) => {
      localStorage.setItem("gosteps.storeUrl", url);
      localStorage.setItem("gosteps.ideUrl", url);
    }, NO_STORE);
    await provide(page);
  },
});

export { expect } from "@playwright/test";
