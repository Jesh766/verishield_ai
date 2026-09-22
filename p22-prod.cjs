const { chromium } = require("@playwright/test");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const failures = [];
  page.on("console", (m) => m.type() === "error" && failures.push(`console:${m.text()}`));
  page.on("pageerror", (e) => failures.push(`pageerror:${e.message}`));
  page.on("requestfailed", (r) =>
    failures.push(`requestfailed:${r.method()} ${r.url()} ${r.failure()?.errorText || ""}`),
  );
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Quick Sign-In/i }).click();
  await page.getByRole("heading", { name: "Select Document Type" }).waitFor({ timeout: 15000 });
  await page.getByText("ENGINE READY").waitFor({ timeout: 120000 });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles("backend/fixtures/samples/aadhaar_valid.png");
  await page
    .getByRole("heading", { name: "Extraction & Validation Results" })
    .waitFor({ timeout: 120000 });
  const extraction = (await page.locator("main").innerText()).slice(0, 2200);
  await page.getByRole("button", { name: /Continue to AI Checks/i }).click();
  await page.getByText(/Heuristic — ELA/i).waitFor();
  await page.getByRole("button", { name: /Proceed to Risk Assessment/i }).click();
  await page.getByText(/RISK SCORE: \d+\/100/i).waitFor();
  const risk = (await page.locator("main").innerText()).slice(0, 1800);
  await page.getByRole("button", { name: /Accept/i }).click();
  await page.getByText("Accepted").waitFor();
  const sessionId = await page.getByText(/VS-\d{6}-[A-Z0-9]+/).innerText();
  await page.getByRole("link", { name: "View receipt" }).click();
  await page.getByText(sessionId).waitFor();
  await page.getByText("Cleared").waitFor();
  const before = await page.locator("main").innerText();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(sessionId).waitFor({ timeout: 15000 });
  await page.getByText("Cleared").waitFor();
  const after = await page.locator("main").innerText();
  console.log(
    JSON.stringify(
      {
        sessionId,
        extraction,
        risk,
        sameReceipt: before === after,
        after: after.slice(0, 2200),
        failures,
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
