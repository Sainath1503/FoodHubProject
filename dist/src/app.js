import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { menu } from "./data/menu.js";
import { OrderValidationError, PaymentFailedError } from "./errors.js";
import { OrderService } from "./services/orderService.js";
import { FakePaymentGateway } from "./services/paymentService.js";
import { foodHubOpenApiSpec } from "./openapi.js";
import { requestLogger } from "./middleware/requestLogger.js";
const orderSchema = z.object({
    items: z.array(z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().positive()
    })),
    paymentToken: z.string().min(1),
    cardId: z.string().optional(),
    customerName: z.string().trim().min(1)
});
const serviceName = "foodhub-takeaway-saas";
export function createApp(orderService = new OrderService(menu, new FakePaymentGateway())) {
    const app = express();
    app.use(cors());
    app.use(express.json());
    if (process.env.NODE_ENV !== "test") {
        app.use(requestLogger);
    }
    app.use(express.static("public"));
    app.get("/health", (_request, response) => {
        response.json({ status: "ok", service: serviceName });
    });
    app.get("/openapi.json", (_request, response) => {
        response.json(foodHubOpenApiSpec);
    });
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(foodHubOpenApiSpec));
    app.get("/menu", (_request, response) => {
        response.json({ items: menu });
    });
    app.post("/order", async (request, response, next) => {
        try {
            const payload = orderSchema.parse(request.body);
            const receipt = await orderService.createOrder(payload);
            response.status(201).json(receipt);
        }
        catch (error) {
            next(error);
        }
    });
    app.use((error, _request, response, _next) => {
        if (error instanceof z.ZodError || error instanceof OrderValidationError) {
            response.status(400).json({ error: "Invalid order", details: error.message });
            return;
        }
        if (error instanceof PaymentFailedError) {
            response.status(402).json({ error: "Payment failed", details: error.message });
            return;
        }
        response.status(500).json({ error: "Internal server error" });
    });
    return app;
}
