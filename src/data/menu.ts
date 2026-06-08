import type { MenuItem } from "../domain/types.js";

export const menu: MenuItem[] = [
  {
    id: "burger-classic",
    name: "Classic Burger",
    description: "Beef patty, cheddar, lettuce, tomato, house sauce",
    price: 9.5,
    category: "main",
    available: true
  },
  {
    id: "wrap-veggie",
    name: "Veggie Halloumi Wrap",
    description: "Grilled halloumi, peppers, greens, lemon yogurt",
    price: 8.25,
    category: "main",
    available: true
  },
  {
    id: "fries-loaded",
    name: "Loaded Fries",
    description: "Crispy fries, cheese, scallions, smoky mayo",
    price: 4.75,
    category: "side",
    available: true
  },
  {
    id: "salad-crunch",
    name: "Crunch Salad",
    description: "Cabbage, cucumber, herbs, sesame dressing",
    price: 4.25,
    category: "side",
    available: false
  },
  {
    id: "cola-zero",
    name: "Cola Zero",
    description: "Chilled 330ml can",
    price: 2.5,
    category: "drink",
    available: true
  },
  {
    id: "lemonade",
    name: "Fresh Lemonade",
    description: "Lemon, mint, sparkling water",
    price: 3.25,
    category: "drink",
    available: true
  }
];
