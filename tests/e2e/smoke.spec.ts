import { expect, test } from "@playwright/test";

test.describe("Public and protected route smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "bookkeeping-app" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();
  });

  test("protected dashboard redirects anonymous users to login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login\?redirectedFrom=%2Fdashboard/);
    await expect(page.getByRole("button", { name: "Send magic link" })).toBeVisible();
  });
});
