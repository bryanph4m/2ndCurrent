import { WebhookVerificationError } from "../errors";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentProvider,
  VerifiedPaymentEvent,
} from "./types";

export class MockPaymentProvider implements PaymentProvider {
  private readonly sessions = new Map<string, CheckoutSession & { input: CreateCheckoutInput }>();
  private nextSessionId = 1;

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const checkoutSessionId = `mock_co_${this.nextSessionId++}`;
    const session: CheckoutSession = {
      checkoutSessionId,
      checkoutUrl: `mock://checkout/${checkoutSessionId}`,
    };
    this.sessions.set(checkoutSessionId, { ...session, input });
    return session;
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent> {
    if (headers.get(MOCK_SIGNATURE_HEADER) !== MOCK_SIGNATURE_VALID) {
      throw new WebhookVerificationError("stripe", "missing or invalid signature header");
    }

    const raw = JSON.parse(rawBody) as {
      eventId: string;
      type: string;
      orderId?: string;
      checkoutSessionId: string;
      paymentId?: string;
      amountCents: number;
      currency: string;
    };
    const session = this.sessions.get(raw.checkoutSessionId);

    if (!session) {
      throw new WebhookVerificationError(
        "stripe",
        `unknown checkout session ${raw.checkoutSessionId}`,
      );
    }

    return {
      eventId: raw.eventId,
      type: raw.type,
      orderId: raw.orderId ?? session.input.orderId,
      checkoutSessionId: raw.checkoutSessionId,
      paymentId: raw.paymentId,
      amountCents: raw.amountCents,
      currency: raw.currency,
      raw,
    };
  }
}
