import { test, expect } from "@playwright/test";

test.describe("search smoke", () => {
  test("hero search submits to /buy with filters", async ({ page }) => {
    await page.goto("/");

    await page.getByPlaceholder("Min Price").fill("100000");
    await page.getByPlaceholder("Max Price").fill("500000");
    await page.getByRole("button", { name: "Search Properties" }).click();

    await expect(page).toHaveURL(/\/buy\?/);
    await expect(page).toHaveURL(/minPrice=100000/);
    await expect(page).toHaveURL(/maxPrice=500000/);
  });

  test("hero search rent toggle submits to /rent", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Rent" }).click();
    await page.getByRole("button", { name: "Search Properties" }).click();

    await expect(page).toHaveURL(/\/rent$/);
  });

  test("navbar search routes to /buy?keyword=...", async ({ page }) => {
    await page.goto("/");

    const keyword = "apartment in mumbai";

    await page
      .getByPlaceholder("Search city, locality, property type...")
      .fill(keyword);

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/buy\?keyword=apartment\+in\+mumbai/);
  });

  test("buy pagination preserves query params", async ({ page }) => {
    await page.goto("/buy?keyword=villa&page=2");

    await expect(page).toHaveURL(/\/buy\?keyword=villa&page=2/);
  });
});
