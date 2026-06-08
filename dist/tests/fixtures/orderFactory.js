import { menu } from "../../src/data/menu.js";
import { createGatewayPaymentToken } from "../../src/services/paymentService.js";
let paymentTokenCounter = 0;
export function createOrder(items = [{ menuItemId: "burger-classic", quantity: 1 }]) {
    paymentTokenCounter += 1;
    return {
        paymentToken: createGatewayPaymentToken("approved-card", `test${paymentTokenCounter}`),
        cardId: "approved-card",
        customerName: "FoodHub Demo User",
        items
    };
}
export function createInvalidOrder() {
    return createOrder([{ menuItemId: "missing-item", quantity: 1 }]);
}
export function createEmptyOrder() {
    return createOrder([]);
}
export function createDeclinedPaymentOrder() {
    return {
        ...createOrder([{ menuItemId: "burger-classic", quantity: 1 }]),
        paymentToken: "gateway_declined_test123",
        cardId: "declined-card"
    };
}
export function createDuplicateItemOrder() {
    return createOrder([
        { menuItemId: "burger-classic", quantity: 1 },
        { menuItemId: "burger-classic", quantity: 2 }
    ]);
}
export function createBoundaryQuantityOrder(quantity) {
    return createOrder([{ menuItemId: "burger-classic", quantity }]);
}
export function createRandomOrder(seed = 1, lineCount = 3) {
    let state = seed;
    const availableMenu = menu.filter((menuItem) => menuItem.available);
    const lines = Array.from({ length: lineCount }, () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        const menuItem = availableMenu[state % availableMenu.length];
        state = (state * 1664525 + 1013904223) % 4294967296;
        return {
            menuItemId: menuItem.id,
            quantity: (state % 3) + 1
        };
    });
    return createOrder(lines);
}
