import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:8080/");
  
  const quickBtn = page.getByRole("button", { name: /Quick Sign-In/i });
  console.log("Quick Sign-In found:", await quickBtn.count() > 0);
  
  if (await quickBtn.count() > 0) {
    await quickBtn.click();
    await page.waitForTimeout(2000);
    
    const selectDoc = page.getByRole("heading", { name: /Select Document Type/i });
    const scanBtn = page.getByRole("button", { name: /SCAN DOCUMENT/i });
    const uploadBtn = page.getByRole("button", { name: /Upload image instead/i });
    const aadhaarBtn = page.getByRole("button", { name: /AADHAAR/i });
    
    console.log("Select Document Type:", await selectDoc.count());
    console.log("SCAN DOCUMENT:", await scanBtn.count());
    console.log("Upload:", await uploadBtn.count());
    console.log("AADHAAR button:", await aadhaarBtn.count());
    
    const body = await page.locator("body").innerText();
    console.log("\n=== Body text (first 1500 chars) ===");
    console.log(body.slice(0, 1500));
  }
  
  await browser.close();
})();
