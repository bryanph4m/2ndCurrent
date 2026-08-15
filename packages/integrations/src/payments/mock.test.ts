import { describe, expect, it } from "vitest";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
import { MockPaymentProvider } from "./mock";

describe("MockPaymentProvider", () => {
  it("maps a valid mock Stripe checkout event to its order", async () => {
    const provider = new MockPaymentProvider();
    const checkout = await provider.createCheckout({
      orderId: "order_1",
      amountCents: 5_000,
      currency: "USD",
      returnUrl: "http://localhost:3000/checkout/return",
    });
    const event = await provider.verifyWebhook(
      JSON.stringify({
        eventId: "evt_stripe_1",
        type: "checkout.session.completed",
        checkoutSessionId: checkout.checkoutSessionId,
        paymentId: "pi_1",
        amountCents: 5_000,
        currency: "USD",
      }),
      new Headers({ [MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_VALID }),
    );

    expect(event.orderId).toBe("order_1");
    expect(event.paymentId).toBe("pi_1");
  });

  it("rejects an invalid signature", async () => {
    const provider = new MockPaymentProvider();
    await expect(provider.verifyWebhook("{}", new Headers())).rejects.toThrow(
      "Webhook verification failed for stripe",
    );
  });
});
