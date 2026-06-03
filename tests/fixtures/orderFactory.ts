import { menu } from "../../src/data/menu.js";
import type { OrderLine, OrderRequest } from "../../src/domain/types.js";

export function createOrder(items: OrderLine[] = [{ menuItemId: "burger-classic", quantity: 1 }]): OrderRequest {
  return {
    paymentToken: "gateway_paid_test123",
    cardId: "approved-card",
    items
  };
}

export function createInvalidOrder(): OrderRequest {
  return createOrder([{ menuItemId: "missing-item", quantity: 1 }]);
}

export function createEmptyOrder(): OrderRequest {
  return createOrder([]);
}

export function createDeclinedPaymentOrder(): OrderRequest {
  return {
    ...createOrder([{ menuItemId: "burger-classic", quantity: 1 }]),
    paymentToken: "gateway_declined_test123",
    cardId: "declined-card"
  };
}

export function createDuplicateItemOrder(): OrderRequest {
  return createOrder([
    { menuItemId: "burger-classic", quantity: 1 },
    { menuItemId: "burger-classic", quantity: 2 }
  ]);
}

export function createBoundaryQuantityOrder(quantity: number): OrderRequest {
  return createOrder([{ menuItemId: "burger-classic", quantity }]);
}

export function createRandomOrder(seed = 1, lineCount = 3): OrderRequest {
  let state = seed;
  const lines = Array.from({ length: lineCount }, () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const menuItem = menu[state % menu.length];
    state = (state * 1664525 + 1013904223) % 4294967296;

    return {
      menuItemId: menuItem.id,
      quantity: (state % 3) + 1
    };
  });

  return createOrder(lines);
}
