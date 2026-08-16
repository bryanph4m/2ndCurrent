import Stripe from "stripe";
import { WebhookVerificationError } from "../errors";
import type {
  CheckoutSession,
  ConnectAccount,
  ConnectOnboardingLink,
  CreateCheckoutInput,
  CreateConnectCheckoutInput,
  CreateConnectOnboardingLinkInput,
  PaymentProvider,
  VerifiedConnectAccountEvent,
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

  // Express: Stripe hosts the onboarding UI and controls the payout
  // experience, which fits sellers who never see a dashboard - Standard
  // accounts assume the connected account operates semi-independently.
  async createConnectAccount(): Promise<ConnectAccount> {
    const account = await this.client.accounts.create({
      type: "express",
      country: "US",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });
    return { accountId: account.id };
  }

  async createConnectOnboardingLink(
    input: CreateConnectOnboardingLinkInput,
  ): Promise<ConnectOnboardingLink> {
    const link = await this.client.accountLinks.create({
      account: input.accountId,
      type: "account_onboarding",
      return_url: input.returnUrl,
      refresh_url: input.refreshUrl,
    });
    return { url: link.url };
  }

  private constructVerifiedEvent(rawBody: string, headers: Headers): Stripe.Event {
    const signature = headers.get("stripe-signature");
    if (!signature) {
      throw new WebhookVerificationError("stripe", "missing Stripe-Signature header");
    }

    try {
      return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      throw new WebhookVerificationError(
        "stripe",
        error instanceof Error ? error.message : "invalid signature",
      );
    }
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent> {
    const event = this.constructVerifiedEvent(rawBody, headers);

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

  async verifyConnectAccountEvent(
    rawBody: string,
    headers: Headers,
  ): Promise<VerifiedConnectAccountEvent> {
    const event = this.constructVerifiedEvent(rawBody, headers);

    if (event.type !== "account.updated") {
      return { eventId: event.id, type: event.type, chargesEnabled: false, payoutsEnabled: false };
    }

    const account = event.data.object as Stripe.Account;
    return {
      eventId: event.id,
      type: event.type,
      accountId: account.id,
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
    };
  }

  // Destination charge: the platform account creates the session and the
  // PaymentIntent, Stripe splits the money at capture time
  // (transfer_data.destination gets the sale minus application_fee_amount).
  // The seller never needs their own Checkout Session or API access.
  async createConnectCheckout(input: CreateConnectCheckoutInput): Promise<CheckoutSession> {
    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.orderId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      phone_number_collection: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountCents,
            product_data: { name: input.productName },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: input.applicationFeeCents,
        transfer_data: { destination: input.sellerAccountId },
      },
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL for the sale session");
    }
    return { checkoutSessionId: session.id, checkoutUrl: session.url };
  }
}
