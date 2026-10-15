import { expect, test } from "@playwright/test";

test("seed", async ({ page }) => {
  await page.goto("/cleaners");
  await expect(page.getByRole("heading", { name: /Find laundry near you/i })).toBeVisible();
});
