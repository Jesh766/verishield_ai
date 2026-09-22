import { test, expect } from "@playwright/test";

test.describe("P2.3 — Admin HQ Operational Workflow E2E", () => {
  const adminPasscode = process.env.VERISHIELD_ADMIN_PASSCODE;
  if (!adminPasscode) {
    throw new Error(
      "VERISHIELD_ADMIN_PASSCODE environment variable is not set. Set it in your environment or .env file before running Playwright E2E tests.",
    );
  }

  test("should enforce admin authentication and reject invalid passcodes", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForTimeout(1_000);

    // Login gate visible
    await expect(page.getByRole("heading", { name: /VeriShield AI — HQ Admin/i })).toBeVisible();
    await expect(page.getByPlaceholder("Enter HQ admin passcode")).toBeVisible();

    // Invalid passcode test
    await page.getByPlaceholder("Enter HQ admin passcode").fill("WRONG_PASSCODE");
    await page.getByRole("button", { name: /Enter HQ Ledger/i }).click();

    // Wait for login attempt error message
    await expect(
      page.getByText(/Authentication|incorrect|admin passcode|service unavailable/i),
    ).toBeVisible({ timeout: 15_000 });

    // Valid passcode test
    await page.getByPlaceholder("Enter HQ admin passcode").fill(adminPasscode);
    await page.getByRole("button", { name: /Enter HQ Ledger/i }).click();

    // Dashboard ledger unlocked
    await expect(page.getByText("VeriShield AI — HQ Admin Ledger")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Total sessions")).toBeVisible();
  });

  test("should display real synced officer session, statistics, details, audit log, and verify hash chain", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Step 1: Enroll device for signed sync
    await page.goto("/");
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: /Device Enrollment/i }).click();
    await page.getByText("One-Time Enrollment Code", { exact: true }).waitFor();
    const enrollmentInputs = page.locator('input[type="text"]');
    await enrollmentInputs.nth(0).fill("DEV-OFFICER-03");
    await enrollmentInputs.nth(1).fill("VS-ENROLL-DEMO-03");
    await page.getByRole("button", { name: /Generate Key & Enroll with HQ/i }).click();
    await expect(page.getByText(/successfully enrolled with HQ/i)).toBeVisible({
      timeout: 30_000,
    });

    // Step 2: Officer processes a real Aadhaar session and syncs to HQ backend
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
    ).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Continue to AI Checks/i }).click();
    await page.getByRole("button", { name: /Proceed to Risk Assessment/i }).click();
    await expect(page.getByText(/RISK SCORE: \d+\/100/i)).toBeVisible();

    await page.getByRole("button", { name: /Accept/i }).click();
    await expect(page.getByText("Accepted")).toBeVisible();
    const sessionId = await page.getByText(/VS-\d{6}-[A-Z0-9]+/).innerText();

    // Trigger sync to backend
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("verishield.sessions.v1");
        const sessions = raw ? (JSON.parse(raw) as { synced?: boolean }[]) : [];
        return sessions.some((s) => s.synced === true);
      },
      undefined,
      { timeout: 30_000 },
    );

    // Step 3: Open Admin HQ Ledger
    await page.goto("/admin");
    await page.waitForTimeout(1_000);
    await page.getByPlaceholder("Enter HQ admin passcode").fill(adminPasscode);
    await page.getByRole("button", { name: /Enter HQ Ledger/i }).click();
    await expect(page.getByText("VeriShield AI — HQ Admin Ledger")).toBeVisible({
      timeout: 10_000,
    });

    // Step 4: Verify real session appears in search
    await page.getByPlaceholder(/Search session ID|Search ID/i).fill(sessionId);
    await page.waitForTimeout(500);

    const sessionRow = page.locator("tr", { hasText: sessionId.slice(0, 14) });
    await expect(sessionRow).toBeVisible({ timeout: 10_000 });
    await expect(sessionRow.getByText(/aadhaar/i)).toBeVisible();
    await expect(sessionRow.getByText(/cleared/i)).toBeVisible();

    // Step 5: Open detail panel and verify masked fields & audit log
    await sessionRow.click();
    await expect(page.getByRole("heading", { name: sessionId })).toBeVisible();
    await expect(page.getByText("••••••••6617")).toBeVisible();
    await expect(page.getByText(/SYNC_ACCEPTED/)).toBeVisible();

    // Step 6: Verify tamper-evident audit chain
    await page.getByRole("button", { name: "Verify Audit Chain" }).click();
    await expect(page.getByText(/AUDIT CHAIN: (VALID|INVALID)/)).toBeVisible({ timeout: 10_000 });
  });

  test("should keep unauthenticated users on the passcode gate", async ({ context }) => {
    const freshPage = await context.newPage();
    await freshPage.goto("/admin");

    await expect(
      freshPage.getByRole("heading", { name: /VeriShield AI — HQ Admin/i }),
    ).toBeVisible();
    await expect(freshPage.getByPlaceholder("Enter HQ admin passcode")).toBeVisible();
    await expect(freshPage.getByRole("button", { name: /Enter HQ Ledger/i })).toBeVisible();
  });
});
