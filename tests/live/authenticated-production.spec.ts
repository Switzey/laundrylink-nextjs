import { expect, test } from "@playwright/test";
import { liveCredentials, loginAs } from "./helpers";

test.describe("dedicated customer QA account", () => {
  test.skip(!liveCredentials("customer"), "Set dedicated E2E_LIVE_CUSTOMER_* credentials.");

  test("logs in securely, opens profile, and cannot access admin", async ({ page, context }) => {
    await loginAs(page, "customer", /\/customer\/dashboard/);
    const cookie = (await context.cookies()).find((item) => item.name.includes("laundrylink_session"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: /profile/i })).toBeVisible();
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });

  test("opens an existing QA order for tracking without mutating it", async ({ page }) => {
    await loginAs(page, "customer", /\/customer\/dashboard/);
    const order = page.getByRole("link", { name: /View order/i }).first();
    test.skip(!(await order.isVisible().catch(() => false)), "The dedicated customer has no isolated QA order.");
    await order.click();
    await expect(page.getByRole("heading", { name: /Order activity/i })).toBeVisible();
  });

  test("can prepare checkout but cannot perform a real payment", async ({ page }) => {
    await loginAs(page, "customer", /\/customer\/dashboard/);
    await page.goto("/cleaners");
    await page.getByRole("link", { name: "View cleaner" }).first().click();
    await page.getByRole("link", { name: "Book this cleaner" }).click();
    await page.locator('input[type="number"]').first().fill("1");
    await expect(page.getByRole("button", { name: "Create order" })).toBeVisible();
    // Intentionally do not submit: live QA never creates an order or payment by default.
  });
});

test.describe("dedicated vendor QA account", () => {
  test.skip(!liveCredentials("vendor"), "Set dedicated E2E_LIVE_VENDOR_* credentials.");

  test("opens vendor workspace and onboarding without admin access", async ({ page }) => {
    await loginAs(page, "vendor", /\/cleaner\/(dashboard|onboarding)/);
    await page.goto("/cleaner/dashboard");
    await expect(page.getByText(/Cleaner workspace|Pending verification/i).first()).toBeVisible();
    await page.goto("/cleaner/onboarding");
    await expect(page.locator("main")).toContainText(/Business|approved|verification/i);
    await page.goto("/admin/dashboard");
    await expect(page).not.toHaveURL(/\/admin\/dashboard/);
  });
});

test.describe("dedicated admin QA account", () => {
  test.skip(!liveCredentials("admin"), "Set dedicated E2E_LIVE_ADMIN_* credentials.");

  test("opens the admin dashboard without changing vendor state", async ({ page }) => {
    await loginAs(page, "admin", /\/admin\/dashboard/);
    await expect(page.getByRole("heading", { name: /Admin|Operations/i }).first()).toBeVisible();
    await expect(page.getByText(/Cleaner approvals/i)).toBeVisible();
    // Approval, suspension, review deletion, and other mutations are intentionally not clicked.
  });
});

test.describe("sandbox-backed authentication mutations", () => {
  test("requests a password reset only when a sandbox inbox is explicitly enabled", async ({ page }) => {
    const email = process.env.E2E_LIVE_RECOVERY_EMAIL?.trim();
    test.skip(process.env.E2E_LIVE_ALLOW_EMAIL !== "true" || !email, "Requires an approved sandbox inbox and explicit email opt-in.");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email!);
    await page.getByRole("button", { name: /reset/i }).click();
    await expect(page.getByText(/If an account exists|check your email/i)).toBeVisible();
  });

  test("registers only an explicitly provisioned disposable QA identity", async ({ page }) => {
    const email = process.env.E2E_LIVE_REGISTRATION_EMAIL?.trim();
    const password = process.env.E2E_LIVE_REGISTRATION_PASSWORD;
    test.skip(process.env.E2E_LIVE_ALLOW_ACCOUNT_CREATION !== "true" || !email || !password, "Requires explicit account-creation opt-in and a disposable QA inbox.");
    await page.goto("/register");
    await page.getByLabel("Name").fill("LaundryLink QA Customer");
    await page.getByLabel("Email").fill(email!);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('input[name="confirm_password"]').fill(password!);
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page).toHaveURL(/\/verify-email/);
  });
});
