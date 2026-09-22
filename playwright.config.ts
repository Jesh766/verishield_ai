import { defineConfig, devices } from "@playwright/test";
import fs from "fs";

// Load environment variables for E2E tests (backend/.env, .env, .env.test)
for (const envFile of ["backend/.env", ".env", ".env.test"]) {
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (key && !(key in process.env)) {
          process.env[key] = val;
        }
      }
    }
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:8080",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000",
      cwd: "backend",
      url: "http://127.0.0.1:8000/health/live",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
