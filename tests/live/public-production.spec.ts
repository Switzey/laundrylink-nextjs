import { expect, test } from "@playwright/test";
import { collectRuntimeErrors, isDesktop } from "./helpers";

const publicPages = [
  ["home", "/", /Laundry pickup and delivery/i],
  ["cleaner search", "/cleaners", /Find your cleaner/i],
  ["login", "/login", /Welcome back/i],
  ["registration", "/register", /Create your account/i],
  ["password recovery", "/forgot-password", /Reset your password/i],
] as const;

test.describe("live public experience", () => {
  for (const [name, pathname, heading] of publicPages) {
    test(`${name} renders without runtime errors or horizontal overflow`, async ({ page }) => {
      const runtime = collectRuntimeErrors(page);
      const response = await page.goto(pathname);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      expect(runtime.pageErrors).toEqual([]);
      expect(runtime.consoleErrors).toEqual([]);
    });
  }

  test("same-origin public links are not broken", async ({ page, request }, testInfo) => {
    test.skip(!isDesktop(testInfo), "Run the link inventory once on desktop.");
    const links = new Set<string>();
    for (const [, pathname] of publicPages) {
      await page.goto(pathname);
      for (const href of await page.locator('a[href]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href))) {
        const url = new URL(href);
        if (url.origin === new URL(page.url()).origin && !url.pathname.startsWith("/api/auth/oauth/")) {
          url.hash = "";
          links.add(url.toString());
        }
      }
    }
    for (const url of links) {
      const response = await request.get(url, { failOnStatusCode: false });
      expect.soft(response.status(), `${url} should not be broken`).toBeLessThan(400);
    }
  });

  test("login, registration, and recovery reject empty forms", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valueMissing", true);
    await expect(page.locator('input[name="password"]')).toHaveJSProperty("validity.valueMissing", true);

    await page.goto("/register");
    await page.getByRole("button", { name: /Create account/i }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valueMissing", true);

    await page.goto("/forgot-password");
    await page.getByRole("button", { name: /reset/i }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valueMissing", true);
  });

  test("cleaner discovery preserves cart intent through authentication", async ({ page }) => {
    await page.goto("/cleaners");
    const firstCleaner = page.getByRole("link", { name: "View cleaner" }).first();
    await expect(firstCleaner).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/cleaners\/\d+$/),
      firstCleaner.click(),
    ]);
    const book = page.getByRole("link", { name: "Book this cleaner" });
    await expect(book).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/orders\/new\?cleaner=\d+/),
      book.click(),
    ]);
    await page.locator('input[type="number"]').first().fill("1");
    const pickup = new Date();
    pickup.setUTCDate(pickup.getUTCDate() + 2);
    await page.getByLabel("Pickup date").fill(pickup.toISOString().slice(0, 10));
    await page.getByLabel("Pickup window").selectOption({ index: 1 });
    await page.getByLabel("Manual pickup address").fill("QA test address");
    await page.getByLabel("Manual delivery address").fill("QA test address");
    await page.getByRole("button", { name: "Continue to sign in" }).click();
    await page.waitForURL(/\/login\?returnTo=/);
    const returnTo = new URL(page.url()).searchParams.get("returnTo");
    expect(returnTo).toMatch(/^\/orders\/new\?cleaner=\d+&resume=1$/);
  });
});

test.describe("live authentication and API security", () => {
  for (const pathname of ["/customer/dashboard", "/cleaner/dashboard", "/admin/dashboard"]) {
    test(`anonymous access to ${pathname} is redirected safely`, async ({ page }) => {
      await page.goto(pathname);
      await expect(page).toHaveURL(/\/login\?/);
      expect(new URL(page.url()).searchParams.get("returnTo")).toBe(pathname);
      await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    });
  }

  test("invalid login is generic and production-safe", async ({ page }) => {
    test.skip(process.env.E2E_LIVE_ENABLE_NEGATIVE_AUTH !== "true", "Opt in to avoid consuming production rate limits.");
    await page.goto("/login");
    await page.getByLabel("Email").fill(`qa-invalid-${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill("not-a-real-password-value");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/node_modules|\bat\s+\w+\s*\(/i);
  });

  test("Google sign-in reaches Google's authorization service", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Continue with Google/i }).click();
    await page.waitForURL(/accounts\.google\.com/);
  });

  test("Apple sign-in reaches Apple's authorization service", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /Continue with Apple/i }).click();
    await expect(page).toHaveURL(/^https:\/\/appleid\.apple\.com\//, { timeout: 15_000 });
  });

  test("security headers protect the public site", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["strict-transport-security"]).toContain("includeSubDomains");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("health endpoint reports a usable service response", async ({ request }) => {
    const response = await request.get("/api/health", { failOnStatusCode: false });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
  });

  test("unknown API routes do not expose stack traces", async ({ request }) => {
    const response = await request.get("/api/does-not-exist", { failOnStatusCode: false });
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toMatch(/node_modules|Error:\s|\bat\s+\w+\s*\(/);
  });
});
