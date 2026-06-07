import { describe, expect, it } from "vitest";
import { FakePaymentGateway } from "../../src/services/paymentService.js";
describe("FakePaymentGateway", () => {
    const gateway = new FakePaymentGateway();
    it("rejects non-positive payment amounts", async () => {
        await expect(gateway.charge(0, "gateway_paid_test123")).resolves.toEqual({
            status: "failed",
            reason: "Amount must be greater than zero"
        });
    });
    it("rejects declined gateway tokens", async () => {
        await expect(gateway.charge(9.5, "gateway_declined_test123")).resolves.toEqual({
            status: "failed",
            reason: "Payment authorization failed"
        });
    });
    it("rejects tokens that did not come from the gateway", async () => {
        await expect(gateway.charge(9.5, "not-a-gateway-token")).resolves.toEqual({
            status: "failed",
            reason: "Payment was not completed through FoodHub Payment Gateway"
        });
    });
    it("creates a payment id from approved gateway tokens", async () => {
        await expect(gateway.charge(9.5, "gateway_paid_test123")).resolves.toEqual({
            status: "paid",
            paymentId: "pay_test123"
        });
    });
});
