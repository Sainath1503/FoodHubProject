export class OrderValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "OrderValidationError";
    }
}
export class PaymentFailedError extends Error {
    constructor(message) {
        super(message);
        this.name = "PaymentFailedError";
    }
}
