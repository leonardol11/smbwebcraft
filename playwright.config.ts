import { defineConfig, devices } from "@playwright/test";

const E2E_ENV = {
  PROVIDER_MODE: "fake",
  DATABASE_URL: "pglite://.data/e2e",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "admin-dev-password",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-secret-not-for-prod",
  APP_URL: "http://localhost:3000",
  NODE_ENV: "development",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    navigationTimeout: 90_000,
    actionTimeout: 30_000,
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The app does not auto-migrate; db:seed runs migrations then seeds.
    command: "pnpm db:seed && pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
