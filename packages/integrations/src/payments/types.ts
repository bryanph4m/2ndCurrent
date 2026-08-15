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

export interface PaymentProvider {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPaymentEvent>;
}
