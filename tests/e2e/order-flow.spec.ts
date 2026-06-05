import { expect, test, type Page } from "@playwright/test";
import {
  createApprovedCheckout,
  createDeclinedPaymentCard,
  createFakePaymentCard
} from "../fixtures/e2eData.js";

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
}

test("customer can view menu, pay through the gateway, and receive an AI suggestion", async ({ page }) => {
  const checkout = createApprovedCheckout();

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await expect(page.getByText(checkout.itemName)).toBeVisible();
  await attachScreenshot(page, "menu-visible");
  await expect(page).toHaveScreenshot("menu-visible.png", {
    fullPage: true,
    animations: "disabled"
  });

  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText(checkout.cartLine)).toBeVisible();
  await expect(page.locator("#cart-total")).toHaveText(checkout.cartTotal);
  await attachScreenshot(page, "cart-ready");
  await expect(page).toHaveScreenshot("cart-ready.png", {
    fullPage: true,
    animations: "disabled"
  });

  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-6781")).toBeVisible();
  await attachScreenshot(page, "gateway-ready");
  await expect(page).toHaveScreenshot("gateway-ready.png", {
    fullPage: true,
    animations: "disabled"
  });

  await page.getByLabel("CVV").fill(checkout.cvv);
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4173/);
  await expect(page.locator("#message")).toContainText(`paid ${checkout.cartTotal}`);
  await expect(page.locator("#message")).toContainText("AI pick");
  await attachScreenshot(page, "paid-receipt");
});

test("customer sees a declined gateway payment failure", async ({ page }) => {
  const declinedCard = createDeclinedPaymentCard();

  await page.goto("/");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.locator("#payment-card").selectOption(declinedCard.id);
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText(declinedCard.maskedNumber)).toBeVisible();
  await attachScreenshot(page, "declined-card-gateway");

  await page.getByLabel("CVV").fill(declinedCard.cvv);
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page.locator("#gateway-message")).toHaveText(`Payment declined for ${declinedCard.maskedNumber}.`);
  await attachScreenshot(page, "declined-payment-message");
});

test("customer can add a fake payment card before launching the gateway", async ({ page }) => {
  const fakeCard = createFakePaymentCard();

  await page.goto("/");

  await page.getByRole("button", { name: "Add fake payment card" }).click();
  await page.getByLabel("Card user name").fill(fakeCard.holderName);
  await page.getByLabel("Card number").fill(fakeCard.number);
  await page.getByRole("button", { name: "Save card" }).click();

  await expect(page.locator("#payment-card")).toContainText(fakeCard.label);
  await attachScreenshot(page, "fake-card-saved");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "FoodHub Payment Gateway" })).toBeVisible();
  await expect(page.getByText(fakeCard.maskedNumber)).toBeVisible();
  await expect(page.getByLabel("Card user name")).toHaveValue(fakeCard.holderName);
  await attachScreenshot(page, "fake-card-gateway");
});
