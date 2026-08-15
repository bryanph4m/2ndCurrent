import {
  MockPaymentProvider,
  StripePaymentProvider,
  type PaymentProvider,
} from "@secondcurrent/integrations";

let paymentProvider: PaymentProvider | undefined;

export function getPaymentProvider(): PaymentProvider {
  if (paymentProvider) {
    return paymentProvider;
  }

  if (process.env.INTEGRATION_MODE === "live") {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const paymentLinkUrl = process.env.STRIPE_PAYMENT_LINK_URL;
    if (!secretKey || !webhookSecret || !paymentLinkUrl) {
      throw new Error(
        "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PAYMENT_LINK_URL are required when INTEGRATION_MODE=live",
      );
    }
    paymentProvider = new StripePaymentProvider({ secretKey, webhookSecret, paymentLinkUrl });
  } else {
    paymentProvider = new MockPaymentProvider();
  }

  return paymentProvider;
}

export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
