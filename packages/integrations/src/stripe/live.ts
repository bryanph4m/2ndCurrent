import Stripe from "stripe";
import { WebhookVerificationError } from "../errors";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  VerifiedPaymentEvent,
} from "../payments/types";

type RetrieveCheckoutSession = (sessionId: string) => Promise<Stripe.Checkout.Session>;

const successfulCheckoutEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

function paymentIntentId(session: Stripe.Checkout.Session): string | undefined {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }
  return session.payment_intent?.id;
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly client: Stripe;
  private readonly paymentLinkUrl: string;
  private readonly webhookSecret: string;
  private readonly retrieveCheckoutSession: RetrieveCheckoutSession;

  constructor(input: {
    secretKey: string;
    webhookSecret: string;
    paymentLinkUrl: string;
    retrieveCheckoutSession?: RetrieveCheckoutSession;
  }) {
    this.client = new Stripe(input.secretKey);
    this.webhookSecret = input.webhookSecret;
    this.paymentLinkUrl = input.paymentLinkUrl;
    this.retrieveCheckoutSession =
      input.retrieveCheckoutSession ??
      ((sessionId) => this.client.checkout.sessions.retrieve(sessionId));

    const url = new URL(this.paymentLinkUrl);
    if (url.protocol !== "https:") {
      throw new Error("STRIPE_PAYMENT_LINK_URL must use HTTPS");
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const checkoutUrl = new URL(this.paymentLinkUrl);
    checkoutUrl.searchParams.set("client_reference_id", input.orderId);

    return { checkoutUrl: checkoutUrl.toString() };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent> {
    const signature = headers.get("stripe-signature");
    if (!signature) {
      throw new WebhookVerificationError("stripe", "missing Stripe-Signature header");
    }

    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      throw new WebhookVerificationError(
        "stripe",
        error instanceof Error ? error.message : "invalid signature",
      );
    }

    if (!successfulCheckoutEvents.has(event.type)) {
      return {
        eventId: event.id,
        type: event.type,
        checkoutSessionId: "",
        amountCents: 0,
        currency: "USD",
        raw: event,
      };
    }

    const webhookSession = event.data.object as Stripe.Checkout.Session;
    const session = await this.retrieveCheckoutSession(webhookSession.id);
    const paid =
      session.payment_status === "paid" || session.payment_status === "no_payment_required";

    return {
      eventId: event.id,
      type: event.type,
      orderId: session.client_reference_id ?? undefined,
      checkoutSessionId: session.id,
      paymentId: paid ? (paymentIntentId(session) ?? session.id) : undefined,
      amountCents: session.amount_total ?? 0,
      currency: session.currency?.toUpperCase() ?? "",
      raw: event,
    };
  }
}
