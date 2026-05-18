import { expect, test } from "@playwright/test";

test.describe("Authenticated smoke (requires seeded auth state)", () => {
  test.use({ storageState: "tests/e2e/.auth/user.json" });

  test.skip(true, "Requires real Supabase credentials and an authenticated storage state fixture.");

  test("dashboard shows transaction form after auth", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible();
    await expect(page.getByLabel("Amount")).toBeVisible();
  });

  test("ledger shows transaction form after auth", async ({ page }) => {
    await page.goto("/ledger");

    await expect(page.getByRole("heading", { name: "Ledger" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible();
  });
});
