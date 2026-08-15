import { createHash } from "node:crypto";
import {
  claimWebhookEventForProcessing,
  createAndLaunchItemStudy,
  findOrderById,
  markOrderPaidAndQueueAnalysis,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  recordWebhookEvent,
  runItemAnalysis,
  startTaskOnce,
} from "@secondcurrent/db";
import { WebhookVerificationError, type VerifiedPaymentEvent } from "@secondcurrent/integrations";
import { getAppBaseUrl, getPaymentProvider } from "@/lib/payment";
import { getHumanReviewProvider } from "@/lib/reviews";
import { getVisionProvider } from "@/lib/vision";
import { getTaskRunner, InlineTaskRunner } from "@/lib/tasks";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

let taskRegistered = false;

function ensureAnalyzeItemTaskRegistered(): void {
  if (taskRegistered) {
    return;
  }
  taskRegistered = true;

  const runner = getTaskRunner();
  if (runner instanceof InlineTaskRunner) {
    runner.registerTask<{ itemId: string }>("analyze-item", async (input) => {
      const vision = getVisionProvider();
      const result = await runItemAnalysis(input.itemId, (image) => vision.analyzeImage(image));
      if (result.outcome === "WAITING_FOR_REVIEW") {
        const reviews = getHumanReviewProvider();
        await createAndLaunchItemStudy(input.itemId, {
          createDraft: (draft) => reviews.createDraft(draft),
          launch: (id) => reviews.launch(id),
          appBaseUrl: getAppBaseUrl(),
        });
      }
      return result;
    });
  }
}

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
  ensureAnalyzeItemTaskRegistered();

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
      if (isSuccessfulCheckoutEvent(event.type) && event.paymentId && event.orderId) {
        const order = await findOrderById(event.orderId);
        if (order) {
          if (
            event.amountCents !== order.amountCents ||
            event.currency.toUpperCase() !== order.currency.toUpperCase()
          ) {
            throw new Error(`Stripe payment amount or currency mismatch for order ${order.id}`);
          }

          const { itemId } = await markOrderPaidAndQueueAnalysis({
            orderId: order.id,
            paymentId: event.paymentId,
            checkoutSessionId: event.checkoutSessionId,
          });
          await startTaskOnce(
            {
              taskName: "analyze-item",
              itemId,
              input: { itemId },
              idempotencyKey: `analyze:${itemId}:1`,
            },
            (taskName, input, idempotencyKey) =>
              getTaskRunner().start(taskName, input, idempotencyKey),
          );
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
