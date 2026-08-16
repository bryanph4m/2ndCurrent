import { WebhookVerificationError } from "../errors";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
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
} from "./types";

export class MockPaymentProvider implements PaymentProvider {
  private readonly sessions = new Map<string, { orderId: string }>();
  private nextSessionId = 1;
  private nextAccountId = 1;

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const checkoutSessionId = `mock_co_${this.nextSessionId++}`;
    this.sessions.set(checkoutSessionId, { orderId: input.orderId });
    return { checkoutSessionId, checkoutUrl: `mock://checkout/${checkoutSessionId}` };
  }

  async createConnectCheckout(input: CreateConnectCheckoutInput): Promise<CheckoutSession> {
    const checkoutSessionId = `mock_co_${this.nextSessionId++}`;
    this.sessions.set(checkoutSessionId, { orderId: input.orderId });
    return { checkoutSessionId, checkoutUrl: `mock://checkout/${checkoutSessionId}` };
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
      orderId: raw.orderId ?? session.orderId,
      checkoutSessionId: raw.checkoutSessionId,
      paymentId: raw.paymentId,
      amountCents: raw.amountCents,
      currency: raw.currency,
      raw,
    };
  }

  async createConnectAccount(): Promise<ConnectAccount> {
    return { accountId: `mock_acct_${this.nextAccountId++}` };
  }

  async createConnectOnboardingLink(
    input: CreateConnectOnboardingLinkInput,
  ): Promise<ConnectOnboardingLink> {
    return { url: `mock://connect-onboarding/${input.accountId}` };
  }

  async verifyConnectAccountEvent(
    rawBody: string,
    headers: Headers,
  ): Promise<VerifiedConnectAccountEvent> {
    if (headers.get(MOCK_SIGNATURE_HEADER) !== MOCK_SIGNATURE_VALID) {
      throw new WebhookVerificationError("stripe", "missing or invalid signature header");
    }

    const raw = JSON.parse(rawBody) as {
      eventId: string;
      type: string;
      accountId?: string;
      chargesEnabled?: boolean;
      payoutsEnabled?: boolean;
    };

    return {
      eventId: raw.eventId,
      type: raw.type,
      accountId: raw.accountId,
      chargesEnabled: raw.chargesEnabled ?? false,
      payoutsEnabled: raw.payoutsEnabled ?? false,
    };
  }
}
