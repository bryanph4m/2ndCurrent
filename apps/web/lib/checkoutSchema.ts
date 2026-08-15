import { z } from "zod";

// No amount field, on purpose: "never accept amount from the client"
// (section 16.2) is not a check the route remembers to make, it's a field
// this schema cannot express. z.parse strips any other field the client
// sends (including a spoofed amountCents) before the route handler sees it.
export const recoveryCheckoutRequestSchema = z.object({ token: z.string() });
