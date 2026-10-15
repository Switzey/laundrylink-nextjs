import { expect, type Page, type TestInfo } from "@playwright/test";

export type LiveRole = "customer" | "vendor" | "admin";

const credentialsByRole = {
  customer: ["E2E_LIVE_CUSTOMER_EMAIL", "E2E_LIVE_CUSTOMER_PASSWORD"],
  vendor: ["E2E_LIVE_VENDOR_EMAIL", "E2E_LIVE_VENDOR_PASSWORD"],
  admin: ["E2E_LIVE_ADMIN_EMAIL", "E2E_LIVE_ADMIN_PASSWORD"],
} as const;

export function liveCredentials(role: LiveRole) {
  const [emailName, passwordName] = credentialsByRole[role];
  const email = process.env[emailName]?.trim();
  const password = process.env[passwordName];
  return email && password ? { email, password } : null;
}

export async function loginAs(page: Page, role: LiveRole, expectedPath: RegExp) {
  const credentials = liveCredentials(role);
  if (!credentials) throw new Error(`Dedicated ${role} QA credentials are not configured.`);
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(expectedPath);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

export function collectRuntimeErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleErrors, pageErrors };
}

export async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: "application/json",
  });
}

export function isDesktop(testInfo: TestInfo) {
  return testInfo.project.name === "desktop-chromium";
}
