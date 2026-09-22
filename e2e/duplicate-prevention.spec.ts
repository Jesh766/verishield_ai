import { test, expect } from "@playwright/test";

test.describe("Officer Workflow - Duplicate Prevention", () => {
  test("should keep the officer landing page stable across reconnect cycles", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page.getByText(/FIELD MODE — WORKS 100% OFFLINE/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: /Quick Sign-In/i })).toBeVisible();
    await expect(page.getByText(/duplicate|already.*processed/i)).toHaveCount(0);
  });

  test("should retain the app shell while network state changes", async ({ page, context }) => {
    await page.goto("/");

    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("link", { name: /HQ Admin Ledger/i })).toBeVisible();
    await expect(page.getByText(/BADGE ID/i)).toBeVisible();
  });
});
