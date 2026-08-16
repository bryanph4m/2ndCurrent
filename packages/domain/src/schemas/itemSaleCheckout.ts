import { z } from "zod";

// No price or fee field, on purpose, same reason the deleted recovery-check
// checkout schema had no amount field: the buyer's phone is the only thing
// this route trusts the client for, everything money-shaped is resolved
// server-side from the listing.
export const ItemSaleCheckoutRequestSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, "Enter a valid phone number"),
});

export type ItemSaleCheckoutRequest = z.infer<typeof ItemSaleCheckoutRequestSchema>;
