import { expect, test } from "@playwright/test";

test("customer can view menu, pay through the gateway, and receive an AI suggestion", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await expect(page.getByText("Classic Burger")).toBeVisible();

  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText("1 x Classic Burger")).toBeVisible();
  await expect(page.locator("#cart-total")).toHaveText("$9.50");

  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-6781")).toBeVisible();

  await page.getByLabel("CVV").fill("123");
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4173/);
  await expect(page.locator("#message")).toContainText("paid $9.50");
  await expect(page.locator("#message")).toContainText("AI pick");
});

test("customer sees a declined gateway payment failure", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.locator("#payment-card").selectOption("declined-card");
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-8911")).toBeVisible();

  await page.getByLabel("CVV").fill("999");
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page.locator("#gateway-message")).toHaveText("Payment declined for xxxx-xxxx-xxxx-8911.");
});

test("customer can add a fake payment card before launching the gateway", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add fake payment card" }).click();
  await page.getByLabel("Card user name").fill("Jordan Lee");
  await page.getByLabel("Card number").fill("4111 1111 1111 2222");
  await page.getByRole("button", { name: "Save card" }).click();

  await expect(page.locator("#payment-card")).toContainText("xxxx-xxxx-xxxx-2222 (Fake Payment Card)");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-2222")).toBeVisible();
  await expect(page.getByLabel("Card user name")).toHaveValue("Jordan Lee");
});
