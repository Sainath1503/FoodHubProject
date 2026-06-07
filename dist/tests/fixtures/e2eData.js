export function createApprovedCheckout() {
    return {
        itemName: "Classic Burger",
        cartLine: "1 x Classic Burger",
        cartTotal: "$9.50",
        customerName: "FoodHub Demo User",
        cvv: "123"
    };
}
export function createDeclinedPaymentCard() {
    return {
        id: "declined-card",
        holderName: "FoodHub Demo User",
        number: "4000 0000 0000 8911",
        maskedNumber: "xxxx-xxxx-xxxx-8911",
        label: "xxxx-xxxx-xxxx-8911 (Declined)",
        cvv: "999"
    };
}
export function createFakePaymentCard() {
    return {
        id: "custom-card",
        holderName: "Jordan Lee",
        number: "4111 1111 1111 2222",
        maskedNumber: "xxxx-xxxx-xxxx-2222",
        label: "xxxx-xxxx-xxxx-2222 (Fake Payment Card)",
        cvv: "123"
    };
}
