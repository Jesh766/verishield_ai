import { test, expect } from "@playwright/test";

test.describe("P3.3 — Field Officer Operations History E2E", () => {
  test("should show empty state, then real sessions with sync states after screening", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Step 1: Open history before any screening — empty state
    await page.goto("/history");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await expect(page.getByText("Screening History")).toBeVisible();
    await expect(page.getByText(/No screenings recorded on this device yet/i)).toBeVisible();

    // Step 2: Go to officer workstation and sign in
    await page.goto("/");
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: /Quick Sign-In/i }).click();
    await expect(page.getByRole("heading", { name: "Select Document Type" })).toBeVisible({
      timeout: 30_000,
    });

    // Step 3: Process a real Aadhaar session
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("backend/fixtures/samples/aadhaar_valid.png");
    await expect(
      page.getByRole("heading", { name: "Extraction & Validation Results" }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Continue to AI Checks/i }).click();
    await page.getByRole("button", { name: /Proceed to Risk Assessment/i }).click();
    await expect(page.getByText(/RISK SCORE: \d+\/100/i)).toBeVisible();

    // Step 4: Record decision
    await page.getByRole("button", { name: /Accept/i }).click();
    await expect(page.getByText("Accepted")).toBeVisible();
    const sessionId = await page.getByText(/VS-\d{6}-[A-Z0-9]+/).innerText();

    // Step 5: Open history — session should appear with sync state
    await page.goto("/history");
    await page.waitForTimeout(1_000);
    await expect(page.getByText("Screening History")).toBeVisible();

    // Session row visible
    const sessionRow = page.locator("tr", { hasText: sessionId.slice(0, 14) });
    await expect(sessionRow).toBeVisible({ timeout: 10_000 });
    await expect(sessionRow.getByText(/aadhaar/i)).toBeVisible();
    await expect(sessionRow.getByText(/cleared/i)).toBeVisible();

    // Sync state pill visible (Synced or Pending depending on backend availability)
    await expect(sessionRow.getByText(/Synced|Pending Sync|Sync Failed/i)).toBeVisible();

    // Step 6: Analytics cards show real data
    await expect(page.getByText("Total Screenings").first()).toBeVisible();
    await expect(page.getByText("Decisions").first()).toBeVisible();
    await expect(page.getByText("Pending Sync").first()).toBeVisible();

    // Step 7: Filter tabs work
    await page.getByRole("button", { name: /^All \(\d+\)$/ }).click();
    await expect(sessionRow).toBeVisible();

    // Step 8: Receipt link works
    await sessionRow.getByRole("link", { name: "Receipt" }).click();
    await expect(page.getByText("Screening receipt")).toBeVisible({ timeout: 10_000 });
  });

  test("should show sync state filter tabs and filter by failed sync state", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Inject a real stored session with failed sync state before load
    await page.addInitScript(() => {
      const failedSession = {
        id: "VS-260904-FAIL01",
        documentType: "passport",
        createdAt: new Date().toISOString(),
        officerId: "VS-0001",
        maskedFields: { name: "TEST USER", passport_number: "J••••••7" },
        checks: [],
        ocrConfidence: 94,
        tamperScore: 15,
        tamperVerdict: "clean",
        faceScore: null,
        faceVerdict: null,
        risk: {
          score: 18,
          band: "clear",
          headline: "No blocking anomalies detected",
          primaryReason: null,
          recommendation: "Every check that could run, passed.",
          contributions: [],
        },
        decision: "referred",
        note: "",
        synced: false,
        syncStatus: "failed",
        retryCount: 1,
        lastAttemptAt: new Date().toISOString(),
      };
      localStorage.setItem("verishield.sessions.v1", JSON.stringify([failedSession]));
    });

    await page.goto("/history");
    await page.waitForTimeout(1_000);

    // Filter tabs visible with counts
    await expect(page.getByRole("button", { name: /^All \(1\)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Failed \(1\)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Synced \(0\)$/ })).toBeVisible();

    // Failed filter shows the session
    await page.getByRole("button", { name: /^Failed \(1\)$/ }).click();
    await expect(page.getByText("VS-260904-FAIL01")).toBeVisible();
    await expect(page.getByText(/Sync Failed/i)).toBeVisible();

    // Synced filter shows empty filter message
    await page.getByRole("button", { name: /^Synced \(0\)$/ }).click();
    await expect(page.getByText(/No sessions match the current filter/i)).toBeVisible();
  });
});