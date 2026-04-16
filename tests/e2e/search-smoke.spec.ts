import { test, expect } from "@playwright/test";

test.describe("search smoke", () => {
  test("hero search submits to /buy with filters", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("hero-search-min-price").fill("100000");
    await page.getByTestId("hero-search-max-price").fill("500000");
    await page.getByTestId("hero-search-submit").click();

    await expect(page).toHaveURL(/\/buy\?/);
    await expect(page).toHaveURL(/minPrice=100000/);
    await expect(page).toHaveURL(/maxPrice=500000/);
  });

  test("hero search rent toggle submits to /rent", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("hero-search-rent-toggle").click();
    await page.getByTestId("hero-search-submit").click();

    await expect(page).toHaveURL(/\/rent$/);
  });

  test("navbar search routes to /buy?keyword=...", async ({ page }) => {
    await page.goto("/");

    const keyword = "apartment in mumbai";

    await page.getByTestId("navbar-search-input").fill(keyword);
    await page.getByTestId("navbar-search-submit").click();

    await expect(page).toHaveURL(/\/buy\?keyword=apartment\+in\+mumbai/);
  });

  test("buy pagination preserves query params", async ({ page }) => {
    await page.goto("/buy?keyword=villa&page=2");

    await expect(page).toHaveURL(/\/buy\?keyword=villa&page=2/);
  });
});
