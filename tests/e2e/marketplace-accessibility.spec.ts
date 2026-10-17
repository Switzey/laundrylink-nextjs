import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("the application entry point sends signed-out users to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

for (const pathname of ["/cleaners", "/cleaners/1", "/waitlist", "/how-it-works", "/login", "/register"]) {
  test(`${pathname} has no serious or critical automated accessibility violations`, async ({ page }, testInfo) => {
    await page.goto(pathname);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    await testInfo.attach("axe-results", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
    expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    }))).toEqual([]);
  });
}
