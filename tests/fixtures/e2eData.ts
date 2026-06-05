export type E2eCheckoutScenario = {
  itemName: string;
  cartLine: string;
  cartTotal: string;
  cvv: string;
};

export type E2ePaymentCard = {
  id: string;
  holderName: string;
  number: string;
  maskedNumber: string;
  label: string;
  cvv: string;
};

export function createApprovedCheckout(): E2eCheckoutScenario {
  return {
    itemName: "Classic Burger",
    cartLine: "1 x Classic Burger",
    cartTotal: "$9.50",
    cvv: "123"
  };
}

export function createDeclinedPaymentCard(): E2ePaymentCard {
  return {
    id: "declined-card",
    holderName: "FoodHub Demo User",
    number: "4000 0000 0000 8911",
    maskedNumber: "xxxx-xxxx-xxxx-8911",
    label: "xxxx-xxxx-xxxx-8911 (Declined)",
    cvv: "999"
  };
}

export function createFakePaymentCard(): E2ePaymentCard {
  return {
    id: "custom-card",
    holderName: "Jordan Lee",
    number: "4111 1111 1111 2222",
    maskedNumber: "xxxx-xxxx-xxxx-2222",
    label: "xxxx-xxxx-xxxx-2222 (Fake Payment Card)",
    cvv: "123"
  };
}
