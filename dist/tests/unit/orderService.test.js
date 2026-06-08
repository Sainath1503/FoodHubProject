import { describe, expect, it, vi } from "vitest";
import { menu } from "../../src/data/menu.js";
import { OrderValidationError, PaymentFailedError } from "../../src/errors.js";
import { OrderService } from "../../src/services/orderService.js";
import { createInvalidOrder, createOrder } from "../fixtures/orderFactory.js";
function gateway(overrides = {}) {
    return {
        charge: vi.fn(async () => ({ status: "paid", paymentId: "pay_test" })),
        ...overrides
    };
}
describe("OrderService", () => {
    it("calculates totals and calls payment with the exact total", async () => {
        const paymentGateway = gateway();
        const service = new OrderService(menu, paymentGateway);
        const receipt = await service.createOrder(createOrder([
            { menuItemId: "burger-classic", quantity: 2 },
            { menuItemId: "cola-zero", quantity: 1 }
        ]));
        expect(receipt.total).toBe(21.5);
        expect(receipt.items).toEqual([
            {
                menuItemId: "burger-classic",
                name: "Classic Burger",
                quantity: 2,
                unitPrice: 9.5,
                lineTotal: 19
            },
            {
                menuItemId: "cola-zero",
                name: "Cola Zero",
                quantity: 1,
                unitPrice: 2.5,
                lineTotal: 2.5
            }
        ]);
        expect(paymentGateway.charge).toHaveBeenCalledWith(21.5, "gateway_paid_test123");
        expect(receipt.customerName).toBe("FoodHub Demo User");
    });
    it("rejects unknown menu items", async () => {
        const service = new OrderService(menu, gateway());
        await expect(service.createOrder(createInvalidOrder())).rejects.toBeInstanceOf(OrderValidationError);
    });
    it("surfaces payment failures", async () => {
        const service = new OrderService(menu, gateway({
            charge: vi.fn(async () => ({ status: "failed", reason: "Payment authorization failed" }))
        }));
        await expect(service.createOrder(createOrder([{ menuItemId: "wrap-veggie", quantity: 1 }]))).rejects.toBeInstanceOf(PaymentFailedError);
    });
});
