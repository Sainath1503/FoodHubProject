import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4173);

createApp().listen(port, "127.0.0.1", () => {
  console.log(`FoodHub Takeaway SaaS running on http://127.0.0.1:${port}`);
});
