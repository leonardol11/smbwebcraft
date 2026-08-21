import { test, expect, type Page } from "@playwright/test";

const PASSWORD = process.env.ADMIN_PASSWORD ?? "admin-dev-password";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Admin password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // First navigation after boot can take a while: Next compiles the route on demand.
  await expect(page).toHaveURL(/\/overview/, { timeout: 90_000 });
}

test.describe("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("overview renders with health pill", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(page.getByTestId("health-pill")).toBeVisible();
    const res = await page.request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(["green", "amber", "red"]).toContain(body.status);
    expect(Array.isArray(body.checks)).toBe(true);
  });

  test("cities page creates a market", async ({ page }) => {
    await page.goto("/cities");
    await expect(page.getByRole("heading", { level: 1, name: "Cities" })).toBeVisible();
    const city = `Testville${Date.now().toString().slice(-5)}`;
    await page.getByPlaceholder("Austin").fill(city);
    await page.getByPlaceholder("TX").fill("CA");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page).toHaveURL(new RegExp(`/cities/${city.toLowerCase()}-ca`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(city);
  });

  test("settings page: kill switches, suppression list, integrations", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByText("Suppression list")).toBeVisible();
    await expect(page.getByText("Integrations", { exact: true })).toBeVisible();
    await expect(page.getByTestId("integrations-panel")).toBeVisible();
    await expect(page.getByTestId("integrations-panel")).toContainText("PROVIDER_MODE");
    await expect(page.getByTestId("integrations-panel")).toContainText("/api/webhooks/stripe");

    for (const flag of ["sending_paused", "reply_agent_paused", "discovery_paused"]) {
      await expect(page.getByTestId(`kill-switch-${flag}`)).toBeVisible();
    }

    // Toggle sending pause on, verify health goes amber with "Paused", then toggle back.
    const sending = page.getByTestId("kill-switch-sending_paused");
    const before = await sending.getAttribute("class");
    await sending.click();
    await expect(sending).not.toHaveClass(before ?? "", { timeout: 10_000 });
    const after = await sending.getAttribute("class");
    const nowPaused = (after ?? "").includes("bg-destructive");
    if (nowPaused) {
      const health = await (await page.request.get("/api/health")).json();
      expect(health.status).not.toBe("green");
      expect(health.reasons.join(" ")).toMatch(/Paused: .*sending/);
    }
    await sending.click();
    await expect(sending).toHaveClass(before ?? "", { timeout: 10_000 });
  });

  test("leads tab renders for a seeded city", async ({ page }) => {
    // Leads live under each city (seeded: austin-tx) on the ?tab=leads tab.
    const res = await page.goto("/cities/austin-tx?tab=leads");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Austin");
    await expect(page.locator("table").first()).toBeVisible();
  });

  test("inbox and clients pages return 200 with an h1", async ({ page }) => {
    for (const path of ["/inbox", "/clients"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  });
});
