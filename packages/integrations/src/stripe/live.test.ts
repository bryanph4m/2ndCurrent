import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { WebhookVerificationError } from "../errors";
import { StripePaymentProvider } from "./live";

const SECRET_KEY = "sk_test_secondcurrent";
const WEBHOOK_SECRET = "whsec_secondcurrent";
const PAYMENT_LINK_URL = "https://buy.stripe.com/test_secondcurrent";
const stripe = new Stripe(SECRET_KEY);

function checkoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    amount_total: 5_000,
    client_reference_id: "order_1",
    currency: "usd",
    payment_intent: "pi_test_1",
    payment_status: "paid",
    ...overrides,
  } as Stripe.Checkout.Session;
}

function signedEvent(session: Stripe.Checkout.Session): { body: string; headers: Headers } {
  const body = JSON.stringify({
    id: "evt_stripe_1",
    object: "event",
    type: "checkout.session.completed",
    data: { object: session },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return { body, headers: new Headers({ "stripe-signature": signature }) };
}

describe("StripePaymentProvider", () => {
  it("adds the order id to the reusable Payment Link", async () => {
    const provider = new StripePaymentProvider({
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      paymentLinkUrl: `${PAYMENT_LINK_URL}?utm_source=secondcurrent`,
      retrieveCheckoutSession: vi.fn(),
    });

    const checkout = await provider.createCheckout({
      orderId: "order_1",
      amountCents: 5_000,
      currency: "USD",
      returnUrl: "https://secondcurrent.example/checkout/return",
    });

    const url = new URL(checkout.checkoutUrl);
    expect(url.searchParams.get("client_reference_id")).toBe("order_1");
    expect(url.searchParams.get("utm_source")).toBe("secondcurrent");
    expect(checkout.checkoutSessionId).toBeUndefined();
  });

  it("verifies, retrieves, and maps a paid Checkout Session", async () => {
    const session = checkoutSession();
    const retrieveCheckoutSession = vi.fn().mockResolvedValue(session);
    const provider = new StripePaymentProvider({
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      paymentLinkUrl: PAYMENT_LINK_URL,
      retrieveCheckoutSession,
    });
    const event = signedEvent(session);

    await expect(provider.verifyWebhook(event.body, event.headers)).resolves.toMatchObject({
      eventId: "evt_stripe_1",
      type: "checkout.session.completed",
      orderId: "order_1",
      checkoutSessionId: "cs_test_1",
      paymentId: "pi_test_1",
      amountCents: 5_000,
      currency: "USD",
    });
    expect(retrieveCheckoutSession).toHaveBeenCalledWith("cs_test_1");
  });

  it("does not authorize fulfillment for an unpaid Checkout Session", async () => {
    const session = checkoutSession({ payment_intent: null, payment_status: "unpaid" });
    const provider = new StripePaymentProvider({
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      paymentLinkUrl: PAYMENT_LINK_URL,
      retrieveCheckoutSession: vi.fn().mockResolvedValue(session),
    });
    const event = signedEvent(session);

    const verified = await provider.verifyWebhook(event.body, event.headers);
    expect(verified.paymentId).toBeUndefined();
  });

  it("rejects an invalid webhook signature before retrieving the session", async () => {
    const retrieveCheckoutSession = vi.fn();
    const provider = new StripePaymentProvider({
      secretKey: SECRET_KEY,
      webhookSecret: WEBHOOK_SECRET,
      paymentLinkUrl: PAYMENT_LINK_URL,
      retrieveCheckoutSession,
    });

    await expect(
      provider.verifyWebhook("{}", new Headers({ "stripe-signature": "invalid" })),
    ).rejects.toThrow(WebhookVerificationError);
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });
});
