import type { PaymentGateway, PaymentResult } from "../domain/types.js";

export class FakePaymentGateway implements PaymentGateway {
  async charge(amount: number, paymentToken: string): Promise<PaymentResult> {
    if (amount <= 0) {
      return { status: "failed", reason: "Amount must be greater than zero" };
    }

    if (paymentToken.startsWith("gateway_declined_") || paymentToken === "tok_fail") {
      return { status: "failed", reason: "Payment authorization failed" };
    }

    if (!paymentToken.startsWith("gateway_paid_") && paymentToken !== "tok_success") {
      return { status: "failed", reason: "Payment was not completed through FoodHub Payment Gateway" };
    }

    return {
      status: "paid",
      paymentId: paymentToken.replace("gateway_paid_", "pay_")
    };
  }
}
