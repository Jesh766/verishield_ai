import { test, expect } from "@playwright/test";

test.describe("Officer Workflow - Happy Path", () => {
  test("should load the officer login screen with the expected controls", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /VeriShield AI/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Quick Sign-In/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /HQ Admin Ledger/i })).toBeVisible();
    await expect(page.getByText(/BADGE ID/i)).toBeVisible();
  });

  test("should process a synthetic document and persist the officer decision", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");

    // TanStack Start hydrates the SSR shell asynchronously in dev mode.
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: /Quick Sign-In/i }).click();
    await expect(page.getByRole("heading", { name: "Select Document Type" })).toBeVisible({
      timeout: 15_000,
    });

    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("backend/fixtures/samples/aadhaar_valid.png");

    await expect(
      page.getByRole("heading", { name: "Extraction & Validation Results" }),
    ).toBeVisible({ timeout: 100_000 });
    await expect(page.getByText("Aadhaar number")).toBeVisible();
    await expect(page.getByText("3 passed")).toBeVisible();
    await expect(page.getByText(/OCR confidence \d+%/i)).toBeVisible();

    await page.getByRole("button", { name: /Continue to AI Checks/i }).click();
    await expect(page.getByRole("heading", { name: /Automated Verification/i })).toBeVisible();
    await expect(page.getByText("Heuristic — ELA, not a trained classifier")).toBeVisible();

    await page.getByRole("button", { name: /Proceed to Risk Assessment/i }).click();
    await expect(page.getByRole("heading", { name: "Risk Assessment & Decision" })).toBeVisible();
    await expect(page.getByText(/RISK SCORE: \d+\/100/i)).toBeVisible();

    await page.getByRole("button", { name: /Accept/i }).click();
    await expect(page.getByText("Accepted")).toBeVisible();

    const receiptLink = page.getByRole("link", { name: "View receipt" });
    await expect(receiptLink).toBeVisible();
    await receiptLink.click();
    await expect(page.getByRole("heading", { name: /VS-\d{6}-/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recorded decision" })).toBeVisible();
    await expect(page.getByText("Cleared")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Extracted fields (masked)" })).toBeVisible();
    await expect(page.getByText(/••••••••6617/)).toBeVisible();
  });
});
