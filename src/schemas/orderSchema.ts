import { z } from "zod";

export const orderSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      quantity: z.number().int().positive()
    })
  ),
  paymentToken: z.string().min(1),
  cardId: z.string().optional(),
  customerName: z.string().trim().min(1)
});
