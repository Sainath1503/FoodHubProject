import { expect, test, type Page } from "@playwright/test";

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
}

test("customer can view menu, pay through the gateway, and receive an AI suggestion", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await expect(page.getByText("Classic Burger")).toBeVisible();
  await attachScreenshot(page, "menu-visible");

  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText("1 x Classic Burger")).toBeVisible();
  await expect(page.locator("#cart-total")).toHaveText("$9.50");
  await attachScreenshot(page, "cart-ready");

  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-6781")).toBeVisible();
  await attachScreenshot(page, "gateway-ready");

  await page.getByLabel("CVV").fill("123");
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4173/);
  await expect(page.locator("#message")).toContainText("paid $9.50");
  await expect(page.locator("#message")).toContainText("AI pick");
  await attachScreenshot(page, "paid-receipt");
});

test("customer sees a declined gateway payment failure", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.locator("#payment-card").selectOption("declined-card");
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-8911")).toBeVisible();
  await attachScreenshot(page, "declined-card-gateway");

  await page.getByLabel("CVV").fill("999");
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page.locator("#gateway-message")).toHaveText("Payment declined for xxxx-xxxx-xxxx-8911.");
  await attachScreenshot(page, "declined-payment-message");
});

test("customer can add a fake payment card before launching the gateway", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add fake payment card" }).click();
  await page.getByLabel("Card user name").fill("Jordan Lee");
  await page.getByLabel("Card number").fill("4111 1111 1111 2222");
  await page.getByRole("button", { name: "Save card" }).click();

  await expect(page.locator("#payment-card")).toContainText("xxxx-xxxx-xxxx-2222 (Fake Payment Card)");
  await attachScreenshot(page, "fake-card-saved");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-2222")).toBeVisible();
  await expect(page.getByLabel("Card user name")).toHaveValue("Jordan Lee");
  await attachScreenshot(page, "fake-card-gateway");
});
