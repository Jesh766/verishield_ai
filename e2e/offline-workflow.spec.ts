import { test, expect } from "@playwright/test";

test.describe("Officer Workflow - Offline Mode", () => {
  test("should load the offline-capable officer landing page", async ({ page, context }) => {
    await page.goto("/");

    await context.setOffline(true);
    await expect(page.getByText(/FIELD MODE — WORKS 100% OFFLINE/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/SIGN IN TO WORKSTATION/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Quick Sign-In/i })).toBeVisible();
  });
});
