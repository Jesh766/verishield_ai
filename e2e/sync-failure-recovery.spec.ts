import { test, expect } from "@playwright/test";

test.describe("Officer Workflow - Sync Failure Recovery", () => {
  test("should keep the officer login shell stable during transient network toggles", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page.getByRole("heading", { name: /VeriShield AI/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: /Quick Sign-In/i })).toBeVisible();
  });

  test("should preserve the app shell across repeated online/offline transitions", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    await context.setOffline(true);
    await context.setOffline(false);
    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("link", { name: /HQ Admin Ledger/i })).toBeVisible();
  });
});
