export function createAiSuggestion(items, menu) {
    const selectedIds = new Set(items.map((item) => item.menuItemId));
    const selectedItems = menu.filter((item) => selectedIds.has(item.id));
    const hasMain = selectedItems.some((item) => item.category === "main");
    const hasSide = selectedItems.some((item) => item.category === "side");
    const hasDrink = selectedItems.some((item) => item.category === "drink");
    if (hasMain && !hasSide) {
        return "AI pick: add Loaded Fries to turn this into a fuller meal.";
    }
    if (hasMain && !hasDrink) {
        return "AI pick: add Fresh Lemonade for a balanced takeaway combo.";
    }
    if (!hasMain) {
        return "AI pick: add a main like the Veggie Halloumi Wrap to complete the order.";
    }
    return "AI pick: this order already looks well balanced.";
}
