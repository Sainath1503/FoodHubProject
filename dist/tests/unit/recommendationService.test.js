import { describe, expect, it } from "vitest";
import { menu } from "../../src/data/menu.js";
import { createAiSuggestion } from "../../src/services/recommendationService.js";
describe("createAiSuggestion", () => {
    it("suggests a side when the order has a main but no side", () => {
        expect(createAiSuggestion([{ menuItemId: "burger-classic", quantity: 1 }], menu)).toContain("Loaded Fries");
    });
    it("recognizes a balanced order", () => {
        expect(createAiSuggestion([
            { menuItemId: "burger-classic", quantity: 1 },
            { menuItemId: "fries-loaded", quantity: 1 },
            { menuItemId: "cola-zero", quantity: 1 }
        ], menu)).toContain("well balanced");
    });
    it("suggests a drink when the order has a main and side but no drink", () => {
        expect(createAiSuggestion([
            { menuItemId: "burger-classic", quantity: 1 },
            { menuItemId: "fries-loaded", quantity: 1 }
        ], menu)).toContain("Fresh Lemonade");
    });
    it("suggests a main when the order only has sides or drinks", () => {
        expect(createAiSuggestion([{ menuItemId: "cola-zero", quantity: 1 }], menu)).toContain("Veggie Halloumi Wrap");
    });
});
