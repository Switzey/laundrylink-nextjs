import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { attachJson } from "./helpers";

const pages = ["/", "/cleaners", "/login", "/register", "/forgot-password"];

for (const pathname of pages) {
  test(`${pathname} has no serious or critical automated accessibility violations`, async ({ page }, testInfo) => {
    await page.goto(pathname);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await attachJson(testInfo, "axe-results", results);
    const severe = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(severe.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    }))).toEqual([]);
  });
}
