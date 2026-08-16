import { createHash } from "node:crypto";
import {
  ITEM_SALE_PRODUCT_CODE,
  claimWebhookEventForProcessing,
  findOrderById,
  markItemSaleCompleted,
  markStripeConnectOnboarded,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  recordWebhookEvent,
} from "@secondcurrent/db";
import { WebhookVerificationError, type VerifiedPaymentEvent } from "@secondcurrent/integrations";
import { getPaymentProvider } from "@/lib/payment";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

function isSuccessfulCheckoutEvent(type: string): boolean {
  return (
    type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded"
  );
}

export async function POST(request: Request): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "stripe-webhook", {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 256_000);
  } catch {
    return requestTooLargeResponse();
  }

  let event: VerifiedPaymentEvent;
  try {
    event = await getPaymentProvider().verifyWebhook(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response("invalid signature", { status: 401 });
    }
    throw error;
  }

  const { id: webhookEventId } = await recordWebhookEvent({
    provider: "stripe",
    externalEventId: event.eventId,
    eventType: event.type,
    rawBody,
    rawBodySha256: createHash("sha256").update(rawBody).digest("hex"),
    headers: Object.fromEntries(request.headers.entries()),
  });

  if (await claimWebhookEventForProcessing(webhookEventId)) {
    try {
      if (event.type === "account.updated") {
        const accountEvent = await getPaymentProvider().verifyConnectAccountEvent(
          rawBody,
          request.headers,
        );
        if (accountEvent.accountId && accountEvent.chargesEnabled && accountEvent.payoutsEnabled) {
          await markStripeConnectOnboarded(accountEvent.accountId);
        }
      } else if (isSuccessfulCheckoutEvent(event.type) && event.paymentId && event.orderId) {
        const order = await findOrderById(event.orderId);
        if (order && order.productCode === ITEM_SALE_PRODUCT_CODE) {
          if (
            event.amountCents !== order.amountCents ||
            event.currency.toUpperCase() !== order.currency.toUpperCase()
          ) {
            throw new Error(`Stripe payment amount or currency mismatch for order ${order.id}`);
          }
          await markItemSaleCompleted({
            orderId: order.id,
            paymentId: event.paymentId,
            checkoutSessionId: event.checkoutSessionId,
          });
        }
      }
      await markWebhookEventProcessed(webhookEventId);
    } catch (error) {
      await markWebhookEventFailed(
        webhookEventId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  return new Response(null, { status: 200 });
}
