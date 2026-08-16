export type CreateCheckoutInput = {
  orderId: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
};

export type CheckoutSession = {
  checkoutSessionId?: string | undefined;
  checkoutUrl: string;
};

export type VerifiedPaymentEvent = {
  eventId: string;
  type: string;
  orderId?: string | undefined;
  checkoutSessionId: string;
  paymentId?: string | undefined;
  amountCents: number;
  currency: string;
  raw: unknown;
};

export type ConnectAccount = {
  accountId: string;
};

export type CreateConnectOnboardingLinkInput = {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
};

export type ConnectOnboardingLink = {
  url: string;
};

export type VerifiedConnectAccountEvent = {
  eventId: string;
  type: string;
  accountId?: string | undefined;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export type CreateConnectCheckoutInput = {
  orderId: string;
  amountCents: number;
  currency: string;
  applicationFeeCents: number;
  sellerAccountId: string;
  successUrl: string;
  cancelUrl: string;
  productName: string;
};

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent>;
  // Seller payouts: an Express connected account per seller, created once
  // and reused - createConnectOnboardingLink is called every time since
  // Stripe's onboarding links are single-use and expire quickly.
  createConnectAccount(): Promise<ConnectAccount>;
  createConnectOnboardingLink(
    input: CreateConnectOnboardingLinkInput,
  ): Promise<ConnectOnboardingLink>;
  // Separate from verifyWebhook because an account.updated payload has no
  // checkout/order shape at all - same signature verification underneath,
  // a narrow parse on top for the one field this app acts on.
  verifyConnectAccountEvent(
    rawBody: string,
    headers: Headers,
  ): Promise<VerifiedConnectAccountEvent>;
  // A real Stripe Checkout Session with a destination charge, unlike
  // createCheckout's static Payment Link - needed because the price and the
  // payout destination both vary per listing.
  createConnectCheckout(input: CreateConnectCheckoutInput): Promise<CheckoutSession>;
}
