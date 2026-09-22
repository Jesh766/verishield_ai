import { test, expect } from "@playwright/test";

test.describe("Officer Workflow - Offline to Online Sync", () => {
  test("should retain the local receipt after an offline browser reload", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await page.waitForTimeout(1_000);
    await page.evaluate(() => navigator.serviceWorker?.ready);
    await page.getByRole("button", { name: /Quick Sign-In/i }).click();
    await expect(page.getByRole("heading", { name: "Select Document Type" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("ENGINE READY")).toBeVisible({ timeout: 120_000 });

    await context.setOffline(true);
    await expect(page.getByText(/FIELD MODE — OFFLINE/i)).toBeVisible({ timeout: 10_000 });
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
    await expect(page.getByText(/OFFLINE · 1 PENDING/i)).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("link", { name: "View receipt" }).click();
    await expect(page.getByText(sessionId)).toBeVisible();
    const syncState = await page
      .getByText(/Pending|Synced/)
      .last()
      .innerText();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(sessionId)).toBeVisible();
    await expect(page.getByText(syncState)).toBeVisible();
    await expect(page.getByText("Cleared")).toBeVisible();
    await expect(page.getByText(/••••••••6617/)).toBeVisible();
  });

  test("should retry an accepted session idempotently after a lost sync response", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    let firstSync = true;
    await page.route("**/sync/session", async (route) => {
      if (firstSync) {
        firstSync = false;
        await route.fetch();
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    await page.waitForTimeout(1_000);
    await page.getByRole("button", { name: /Device Enrollment/i }).click();
    await page.getByText("One-Time Enrollment Code", { exact: true }).waitFor();
    const enrollmentInputs = page.locator('input[type="text"]');
    await enrollmentInputs.nth(0).fill("DEV-OFFICER-01");
    await enrollmentInputs.nth(1).fill("VS-ENROLL-DEMO-01");
    await page.getByRole("button", { name: /Generate Key & Enroll with HQ/i }).click();
    await expect(page.getByText(/successfully enrolled with HQ/i)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /Quick Sign-In/i }).click();
    await expect(page.getByText("ENGINE READY")).toBeVisible({ timeout: 120_000 });

    await context.setOffline(true);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("backend/fixtures/samples/aadhaar_valid.png");
    await expect(
      page.getByRole("heading", { name: "Extraction & Validation Results" }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Continue to AI Checks/i }).click();
    await page.getByRole("button", { name: /Proceed to Risk Assessment/i }).click();
    await page.getByRole("button", { name: /Accept/i }).click();
    await expect(page.getByText(/OFFLINE · 1 PENDING/i)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText("BACKEND UNAVAILABLE", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.unroute("**/sync/session");
    await context.setOffline(true);
    await context.setOffline(false);
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("verishield.sessions.v1");
        const sessions = raw ? (JSON.parse(raw) as { decision?: string; synced?: boolean }[]) : [];
        return sessions.some(
          (session) => session.decision === "cleared" && session.synced === true,
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    await page.getByRole("link", { name: "View receipt" }).click();
    await expect(page.getByText("Synced")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Cleared")).toBeVisible();
  });

  test("should screen offline, queue the decision, and sync it after reconnect", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await page.waitForTimeout(1_000);

    await page.getByRole("button", { name: /Device Enrollment/i }).click();
    await page.getByText("One-Time Enrollment Code", { exact: true }).waitFor();
    const enrollmentInputs = page.locator('input[type="text"]');
    await enrollmentInputs.nth(0).fill("DEV-OFFICER-02");
    await enrollmentInputs.nth(1).fill("VS-ENROLL-DEMO-02");
    await page.getByRole("button", { name: /Generate Key & Enroll with HQ/i }).click();
    await expect(page.getByText(/successfully enrolled with HQ/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /Quick Sign-In/i }).click();
    await expect(page.getByText(/STATUS: AWAITING DOCUMENT/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("ENGINE READY")).toBeVisible({ timeout: 120_000 });

    await context.setOffline(true);
    await expect(page.getByText(/FIELD MODE — OFFLINE/i)).toBeVisible({ timeout: 10_000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles("backend/fixtures/samples/aadhaar_valid.png");
    await expect(
      page.getByRole("heading", { name: "Extraction & Validation Results" }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: /Continue to AI Checks/i }).click();
    await expect(page.getByText(/Heuristic — ELA/i)).toBeVisible();
    await page.getByRole("button", { name: /Proceed to Risk Assessment/i }).click();
    await expect(page.getByText(/RISK SCORE: \d+\/100/i)).toBeVisible();
    await page.getByRole("button", { name: /Accept/i }).click();
    await expect(page.getByText("Accepted")).toBeVisible();
    await expect(page.getByText(/OFFLINE · 1 PENDING/i)).toBeVisible();

    await context.setOffline(false);
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("verishield.sessions.v1");
        const sessions = raw ? (JSON.parse(raw) as { decision?: string; synced?: boolean }[]) : [];
        return sessions.some(
          (session) => session.decision === "cleared" && session.synced === true,
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    await page.getByRole("link", { name: "View receipt" }).click();
    await expect(page.getByText("Synced")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Cleared")).toBeVisible();
    await expect(page.getByText(/••••••••6617/)).toBeVisible();
  });

  test("should expose the officer login screen before and after offline toggles", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    await context.setOffline(true);
    await expect(page.getByRole("heading", { name: /VeriShield AI/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/FIELD MODE — WORKS 100% OFFLINE/i)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByRole("button", { name: /Quick Sign-In/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test("should keep the app shell visible during network transitions", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    await context.setOffline(true);
    await context.setOffline(false);

    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("link", { name: /HQ Admin Ledger/i })).toBeVisible();
  });
});
