import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

const password = "e2e-test-password";
const databasePath = path.resolve(process.env.E2E_DATABASE_PATH ?? "data/e2e.sqlite");

function resetPricingState() {
  const database = new DatabaseSync(databasePath);
  try {
    const timestamp = new Date().toISOString();
    const cleaner = database.prepare(`
      SELECT cleaners.id
      FROM cleaners
      JOIN users ON users.id = cleaners.user_id
      WHERE users.email = 'cleaner@example.com'
    `).get() as { id: number } | undefined;

    expect(cleaner).toBeTruthy();
    database.prepare(`UPDATE cleaners SET
      verification_status = 'approved', is_approved = 1, is_published = 1,
      is_suspended = 0, is_available = 1, approved_at = ?, updated_at = ?
      WHERE id = ?`).run(timestamp, timestamp, cleaner!.id);
    const service = database.prepare(`UPDATE services SET
      price = 1800, unit = 'per_kg', minimum_quantity = 0.5, quantity_step = 0.5,
      express_available = 1, requires_final_confirmation = 1, is_active = 1, updated_at = ?
      WHERE cleaner_id = ? AND name = 'Wash & Fold'`).run(timestamp, cleaner!.id);
    expect(service.changes).toBe(1);
    database.exec("DELETE FROM js_sessions; DELETE FROM rate_limits;");
  } finally {
    database.close();
  }
}

async function login(page: import("@playwright/test").Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(expectedPath);
}

function futureDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test("vendor catalogue and customer pricing flow render on desktop and mobile", async ({ browser }) => {
  test.slow();
  resetPricingState();
  const vendorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const vendorPage = await vendorContext.newPage();
  await login(vendorPage, "cleaner@example.com", /\/cleaner\/dashboard/);
  await vendorPage.goto("/cleaner/services");
  await expect(vendorPage.getByRole("heading", { name: "Services and pricing" })).toBeVisible();
  await expect(vendorPage.getByRole("heading", { name: "Order and delivery rules" })).toBeVisible();
  await expect(vendorPage.getByText("Current services")).toBeVisible();
  await vendorPage.screenshot({ path: "test-results/pricing-vendor-desktop.png", fullPage: true });

  await vendorPage.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => vendorPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await vendorPage.screenshot({ path: "test-results/pricing-vendor-mobile.png", fullPage: true });
  await vendorContext.close();

  const customerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const customerPage = await customerContext.newPage();
  await login(customerPage, "customer@example.com", /\/customer\/dashboard/);
  await customerPage.goto("/orders/new?cleaner=1");
  await expect(customerPage.getByRole("heading", { name: /Services from FreshFold Laundry/ })).toBeVisible();
  await customerPage.waitForLoadState("networkidle");
  await customerPage.getByRole("spinbutton", { name: "Wash & Fold quantity", exact: true }).fill("2.5");
  await customerPage.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(customerPage.getByRole("heading", { name: "Pickup and delivery address" })).toBeVisible();
  await customerPage.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(customerPage.getByRole("heading", { name: "Pickup and return schedule" })).toBeVisible();
  await customerPage.getByLabel("Pickup date").fill(futureDate(3));
  await expect(customerPage.getByLabel("Pickup window")).toBeEnabled();
  await customerPage.getByLabel("Pickup window").selectOption({ index: 1 });
  await customerPage.getByLabel("Delivery window").selectOption({ index: 1 });
  await customerPage.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(customerPage.getByRole("heading", { name: "Payment" })).toBeVisible();
  await expect(customerPage.getByText("Estimated total")).toBeVisible();
  await expect(customerPage.getByText("I understand that estimated quantities may be revised after physical inspection.")).toBeVisible();
  await customerPage.screenshot({ path: "test-results/pricing-checkout-desktop.png", fullPage: true });
  await customerContext.close();
});
