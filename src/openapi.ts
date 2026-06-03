type OpenApiDocument = Record<string, unknown>;

export const foodHubOpenApiSpec: OpenApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "FoodHub Takeaway SaaS API",
    version: "1.0.0",
    description:
      "OpenAPI documentation for the FoodHub takeaway ordering API and the FoodHub Payment Gateway service."
  },
  servers: [
    {
      url: "http://127.0.0.1:4173",
      description: "FoodHub Takeaway SaaS"
    },
    {
      url: "http://127.0.0.1:4174",
      description: "FoodHub Payment Gateway"
    }
  ],
  tags: [
    { name: "FoodHub App", description: "Menu and order APIs" },
    { name: "Payment Gateway", description: "Fake payment gateway status and browser handoff" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["FoodHub App", "Payment Gateway"],
        summary: "Check service health",
        description:
          "Both FoodHub Takeaway SaaS on port 4173 and FoodHub Payment Gateway on port 4174 expose GET /health.",
        servers: [{ url: "http://127.0.0.1:4173" }, { url: "http://127.0.0.1:4174" }],
        responses: {
          "200": {
            description: "Service is running",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/AppHealth" },
                    { $ref: "#/components/schemas/PaymentGatewayHealth" }
                  ]
                },
                examples: {
                  app: {
                    summary: "FoodHub app",
                    value: { status: "ok" }
                  },
                  paymentGateway: {
                    summary: "FoodHub Payment Gateway",
                    value: { status: "ok", service: "FoodHub Payment Gateway" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/menu": {
      get: {
        tags: ["FoodHub App"],
        summary: "Fetch takeaway menu",
        servers: [{ url: "http://127.0.0.1:4173" }],
        responses: {
          "200": {
            description: "Menu items",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MenuResponse" }
              }
            }
          }
        }
      }
    },
    "/order": {
      post: {
        tags: ["FoodHub App"],
        summary: "Create an order after gateway payment",
        description:
          "Validates menu items, calculates totals, checks the fake payment token returned by FoodHub Payment Gateway, then creates a paid order.",
        servers: [{ url: "http://127.0.0.1:4173" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderRequest" },
              examples: {
                approved: {
                  summary: "Approved gateway payment",
                  value: {
                    paymentToken: "gateway_paid_test123",
                    cardId: "approved-card",
                    items: [
                      { menuItemId: "wrap-veggie", quantity: 1 },
                      { menuItemId: "lemonade", quantity: 2 }
                    ]
                  }
                },
                declined: {
                  summary: "Declined gateway payment",
                  value: {
                    paymentToken: "gateway_declined_test123",
                    cardId: "declined-card",
                    items: [{ menuItemId: "burger-classic", quantity: 1 }]
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Paid order receipt",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrderReceipt" }
              }
            }
          },
          "400": {
            description: "Invalid order request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Invalid order", details: "Order must contain at least one item" }
              }
            }
          },
          "402": {
            description: "Payment failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Payment failed", details: "Payment authorization failed" }
              }
            }
          },
          "500": {
            description: "Unexpected server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/": {
      get: {
        tags: ["Payment Gateway"],
        summary: "Launch FoodHub Payment Gateway UI",
        description:
          "Browser page used by the checkout flow. The main app redirects here with amount, maskedNumber, outcome, cardholder, cardId, and returnUrl query parameters.",
        servers: [{ url: "http://127.0.0.1:4174" }],
        parameters: [
          { name: "amount", in: "query", schema: { type: "number", example: 9.5 } },
          { name: "cardId", in: "query", schema: { type: "string", example: "approved-card" } },
          {
            name: "maskedNumber",
            in: "query",
            schema: { type: "string", example: "xxxx-xxxx-xxxx-6781" }
          },
          { name: "outcome", in: "query", schema: { type: "string", enum: ["approved", "declined"] } },
          { name: "cardholder", in: "query", schema: { type: "string", example: "FoodHub Demo User" } },
          { name: "returnUrl", in: "query", schema: { type: "string", example: "http://127.0.0.1:4173/" } }
        ],
        responses: {
          "200": {
            description: "Payment gateway HTML page"
          }
        }
      }
    }
  },
  components: {
    schemas: {
      AppHealth: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", example: "ok" }
        }
      },
      PaymentGatewayHealth: {
        type: "object",
        required: ["status", "service"],
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "FoodHub Payment Gateway" }
        }
      },
      MenuItem: {
        type: "object",
        required: ["id", "name", "description", "price", "category"],
        properties: {
          id: { type: "string", example: "burger-classic" },
          name: { type: "string", example: "Classic Burger" },
          description: { type: "string", example: "Beef patty, cheddar, lettuce, tomato, house sauce" },
          price: { type: "number", example: 9.5 },
          category: { type: "string", enum: ["main", "side", "drink"], example: "main" }
        }
      },
      MenuResponse: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/MenuItem" }
          }
        }
      },
      OrderLine: {
        type: "object",
        required: ["menuItemId", "quantity"],
        properties: {
          menuItemId: { type: "string", example: "burger-classic" },
          quantity: { type: "integer", minimum: 1, maximum: 20, example: 2 }
        }
      },
      OrderRequest: {
        type: "object",
        required: ["items", "paymentToken"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderLine" }
          },
          paymentToken: {
            type: "string",
            description: "Fake payment token returned by FoodHub Payment Gateway.",
            example: "gateway_paid_test123"
          },
          cardId: {
            type: "string",
            example: "approved-card"
          }
        }
      },
      OrderReceiptLine: {
        type: "object",
        required: ["menuItemId", "name", "quantity", "unitPrice", "lineTotal"],
        properties: {
          menuItemId: { type: "string", example: "burger-classic" },
          name: { type: "string", example: "Classic Burger" },
          quantity: { type: "integer", example: 2 },
          unitPrice: { type: "number", example: 9.5 },
          lineTotal: { type: "number", example: 19 }
        }
      },
      OrderReceipt: {
        type: "object",
        required: ["orderId", "items", "total", "paymentStatus", "paymentId", "aiSuggestion"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderReceiptLine" }
          },
          total: { type: "number", example: 21.5 },
          paymentStatus: { type: "string", enum: ["paid"], example: "paid" },
          paymentId: { type: "string", example: "pay_test123" },
          aiSuggestion: { type: "string", example: "AI pick: add Loaded Fries to turn this into a fuller meal." }
        }
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", example: "Invalid order" },
          details: { type: "string", example: "Unknown menu item: missing-item" }
        }
      }
    }
  }
};
