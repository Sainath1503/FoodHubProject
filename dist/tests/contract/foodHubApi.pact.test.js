import { MatchersV3, PactV3, Verifier } from "@pact-foundation/pact";
import { describe, expect, it } from "vitest";
import path from "node:path";
import { createApp } from "../../src/app.js";
import { createOrder } from "../fixtures/orderFactory.js";
const pactDir = path.resolve(process.cwd(), "pacts");
const pactFile = path.join(pactDir, "FoodHub Web-FoodHub API.json");
const jsonContentType = MatchersV3.regex(/^application\/json(; ?charset=utf-8)?$/i, "application/json");
process.env.PACT_DO_NOT_TRACK = "true";
describe("FoodHub API Pact contract", () => {
    it("generates and verifies the FoodHub Web consumer contract", async () => {
        await new PactV3({
            consumer: "FoodHub Web",
            provider: "FoodHub API",
            dir: pactDir,
            logLevel: "warn"
        })
            .addInteraction({
            uponReceiving: "a request for the takeaway menu",
            withRequest: {
                method: "GET",
                path: "/menu"
            },
            willRespondWith: {
                status: 200,
                headers: {
                    "Content-Type": jsonContentType
                },
                body: {
                    items: MatchersV3.eachLike({
                        id: MatchersV3.string("burger-classic"),
                        name: MatchersV3.string("Classic Burger"),
                        description: MatchersV3.string("Beef patty, cheddar, lettuce, tomato, house sauce"),
                        price: MatchersV3.number(9.5),
                        category: MatchersV3.regex("main|side|drink", "main")
                    }, 1)
                }
            }
        })
            .addInteraction({
            uponReceiving: "a request to create a paid order",
            withRequest: {
                method: "POST",
                path: "/order",
                headers: {
                    "Content-Type": jsonContentType
                },
                body: createOrder([{ menuItemId: "burger-classic", quantity: 1 }])
            },
            willRespondWith: {
                status: 201,
                headers: {
                    "Content-Type": jsonContentType
                },
                body: {
                    orderId: MatchersV3.uuid("11111111-1111-4111-8111-111111111111"),
                    items: [
                        {
                            menuItemId: "burger-classic",
                            name: "Classic Burger",
                            quantity: 1,
                            unitPrice: 9.5,
                            lineTotal: 9.5
                        }
                    ],
                    total: 9.5,
                    paymentStatus: "paid",
                    paymentId: MatchersV3.regex(/^pay_.+$/, "pay_test123"),
                    customerName: MatchersV3.string("FoodHub Demo User"),
                    aiSuggestion: MatchersV3.string("Add a side to make this meal feel complete.")
                }
            }
        })
            .executeTest(async (mockServer) => {
            const menuResponse = await fetch(`${mockServer.url}/menu`);
            expect(menuResponse.status).toBe(200);
            await expect(menuResponse.json()).resolves.toEqual(expect.objectContaining({
                items: expect.arrayContaining([expect.objectContaining({ name: "Classic Burger" })])
            }));
            const orderResponse = await fetch(`${mockServer.url}/order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(createOrder([{ menuItemId: "burger-classic", quantity: 1 }]))
            });
            expect(orderResponse.status).toBe(201);
            await expect(orderResponse.json()).resolves.toEqual(expect.objectContaining({
                total: 9.5,
                paymentStatus: "paid"
            }));
        });
        const server = await startProvider();
        const address = server.address();
        try {
            await new Verifier({
                provider: "FoodHub API",
                providerBaseUrl: `http://127.0.0.1:${address.port}`,
                pactUrls: [pactFile],
                stateHandlers: {
                    "": async () => undefined
                },
                logLevel: "warn"
            }).verifyProvider();
        }
        finally {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
    });
});
async function startProvider() {
    const server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    return server;
}
