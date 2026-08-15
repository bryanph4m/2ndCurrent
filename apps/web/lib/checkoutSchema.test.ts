import { describe, expect, it } from "vitest";
import { recoveryCheckoutRequestSchema } from "./checkoutSchema";

describe("recoveryCheckoutRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = recoveryCheckoutRequestSchema.parse({ token: "tok_1" });
    expect(result).toEqual({ token: "tok_1" });
  });

  // This is the "client cannot set price" acceptance criterion, stated as a
  // check: even a client that sends amountCents never gets it through to the
  // order-creation call, because the parsed object never carries the field.
  it("drops a client-supplied amountCents instead of passing it through", () => {
    const result = recoveryCheckoutRequestSchema.parse({ token: "tok_1", amountCents: 1 });
    expect(result).toEqual({ token: "tok_1" });
    expect(Object.keys(result)).toEqual(["token"]);
  });

  it("rejects a request with no token", () => {
    expect(() => recoveryCheckoutRequestSchema.parse({ amountCents: 500 })).toThrow();
  });
});
